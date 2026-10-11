import ExpoModulesCore
import CryptoKit
import Foundation
import Network

/**
 * Pinned-TLS HTTP client for the CADCAMFUN companion gateway.
 *
 * The desktop sidecar serves the pairing gateway on a self-signed P-256 certificate whose
 * SHA-256 fingerprint the phone learns from the pairing QR code. Plain `fetch` would reject
 * that certificate; this module performs the same requests through `URLSession` with a custom
 * trust evaluator that accepts exactly one leaf: the one whose DER bytes hash to `fingerprint`.
 * No trust-on-first-use, no redirects, https only.
 *
 * Streaming: `streamStart` returns a `CompanionStreamHandle` shared object. The JS side pulls
 * `readNext()` until `done` — each call resolves with the next received chunk (raw text, the
 * JS SSE parser owns framing), so backpressure is natural and no event routing is needed.
 */

private func sha256Hex(_ data: Data) -> String {
  SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

private func accept(_ challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void, fingerprint: String) {
  guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
    let trust = challenge.protectionSpace.serverTrust,
    let certificates = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
    let leaf = certificates.first else {
    completionHandler(.cancelAuthenticationChallenge, nil)
    return
  }
  let der = SecCertificateCopyData(leaf) as Data
  if sha256Hex(der) == fingerprint {
    completionHandler(.useCredential, URLCredential(trust: trust))
  } else {
    completionHandler(.cancelAuthenticationChallenge, nil)
  }
}

/** Thrown for anything the phone should render as a readable pairing/connection error. */
struct CompanionNetError: Error, LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

private final class PinnedDelegate: NSObject, URLSessionDelegate, URLSessionDataDelegate {
  let fingerprint: String
  var onData: ((Data) -> Void)?
  var onComplete: ((Error?) -> Void)?
  var status: Int?

  init(fingerprint: String) {
    self.fingerprint = fingerprint
  }

  func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    accept(challenge, completionHandler: completionHandler, fingerprint: fingerprint)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    status = (response as? HTTPURLResponse)?.statusCode
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    onData?(data)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    onComplete?(error)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    // No redirects: a pinned transport must not be walked anywhere else.
    completionHandler(nil)
  }
}

enum PinnedTransport {
  /**
   * One-shot request. Implemented on the data-delegate path rather than
   * `URLSession.data(for:)` so the pin evaluator always owns the challenge.
   * Mixing the async convenience API with a `URLSessionDataDelegate` drops
   * the challenge on some iOS versions and pairing then fails as "did not answer".
   */
  static func request(baseUrl: String, path: String, method: String, headers: [String: String], body: String?, fingerprint: String) async throws -> [String: Any] {
    var request = try makeRequest(baseUrl: baseUrl, path: path, method: method, headers: headers, body: body)
    request.timeoutInterval = 30

    let delegate = PinnedDelegate(fingerprint: fingerprint)
    let session = URLSession(configuration: .ephemeral, delegate: delegate, delegateQueue: nil)
    defer { session.finishTasksAndInvalidate() }

    return try await withCheckedThrowingContinuation { continuation in
      var bodyData = Data()
      var settled = false
      let finish: (Result<[String: Any], Error>) -> Void = { result in
        guard !settled else { return }
        settled = true
        continuation.resume(with: result)
      }
      delegate.onData = { bodyData.append($0) }
      delegate.onComplete = { error in
        if let error {
          finish(.failure(CompanionNetError(message: friendly(error))))
          return
        }
        finish(.success([
          "status": delegate.status ?? 0,
          "headers": [:] as [String: String],
          "body": String(decoding: bodyData, as: UTF8.self),
        ]))
      }
      session.dataTask(with: request).resume()
    }
  }

  static func makeRequest(baseUrl: String, path: String, method: String, headers: [String: String], body: String?) throws -> URLRequest {
    guard let base = URL(string: baseUrl), base.scheme == "https", base.host != nil, base.user == nil, base.password == nil else {
      throw CompanionNetError(message: "The desktop address must be https")
    }
    guard path.hasPrefix("/api/"), !path.hasPrefix("//"),
      let url = URL(string: path, relativeTo: base)?.absoluteURL,
      url.scheme == base.scheme, url.host == base.host, url.port == base.port else {
      throw CompanionNetError(message: "Invalid desktop address")
    }
    var request = URLRequest(url: url)
    request.httpMethod = method
    for (key, value) in headers {
      request.setValue(value, forHTTPHeaderField: key)
    }
    if let body {
      request.httpBody = Data(body.utf8)
    }
    return request
  }

  private static func friendly(_ error: Error) -> String {
    let code = (error as NSError).code
    let message = error.localizedDescription
    if code == NSURLErrorCancelled {
      return "Connection closed"
    }
    if code == NSURLErrorCannotFindHost || code == NSURLErrorCannotConnectToHost || code == NSURLErrorNetworkConnectionLost || code == NSURLErrorNotConnectedToInternet || code == NSURLErrorTimedOut {
      return "Cannot reach the desktop. Join the same Wi-Fi or Personal Hotspot as the Mac, or type a Tailscale address."
    }
    if code == NSURLErrorSecureConnectionFailed || code == NSURLErrorServerCertificateUntrusted || code == NSURLErrorServerCertificateHasBadDate || code == NSURLErrorServerCertificateNotYetValid || code == NSURLErrorServerCertificateHasUnknownRoot {
      return "Certificate does not match the pairing QR code"
    }
    if message.contains("The certificate for this server is invalid") {
      return "Certificate does not match the pairing QR code"
    }
    return message
  }
}

public class CompanionStreamHandle: SharedObject {
  private let lock = NSLock()
  private var session: URLSession?
  private var chunks: [String] = []
  private var utf8Pending = Data()
  private var finished = false
  private var error: Error?
  private var status: Int?
  private var waiters: [CheckedContinuation<[String: Any], Never>] = []

  public func start(baseUrl: String, path: String, method: String, headers: [String: String], body: String?, fingerprint: String) throws {
    let request: URLRequest
    do {
      request = try PinnedTransport.makeRequest(baseUrl: baseUrl, path: path, method: method, headers: headers, body: body)
    } catch {
      throw error
    }

    let delegate = PinnedDelegate(fingerprint: fingerprint)
    let session = URLSession(configuration: .ephemeral, delegate: delegate, delegateQueue: nil)
    self.session = session

    delegate.onData = { [weak self] data in
      guard let self else { return }
      self.lock.lock()
      guard !self.finished else { self.lock.unlock(); return }
      let text = self.decodeChunk(data, flush: false)
      if text.isEmpty { self.lock.unlock(); return }
      if !self.waiters.isEmpty {
        let waiter = self.waiters.removeFirst()
        self.lock.unlock()
        waiter.resume(returning: ["done": false, "data": text])
      } else {
        self.chunks.append(text)
        self.lock.unlock()
      }
    }
    delegate.onComplete = { [weak self, weak delegate, weak session] streamError in
      guard let self else { return }
      self.lock.lock()
      guard !self.finished else { self.lock.unlock(); return }
      let tail = self.decodeChunk(Data(), flush: true)
      if !tail.isEmpty { self.chunks.append(tail) }
      self.status = delegate?.status
      self.finished = true
      self.error = streamError
      let waiters = self.waiters
      self.waiters.removeAll()
      let done = self.doneValue()
      self.session = nil
      self.lock.unlock()
      session?.finishTasksAndInvalidate()
      for waiter in waiters { waiter.resume(returning: done) }
    }

    let task = session.dataTask(with: request)
    task.resume()
  }

  public func readNext() async -> [String: Any] {
    await withCheckedContinuation { continuation in
      lock.lock()
      if !chunks.isEmpty {
        let chunk = chunks.removeFirst()
        lock.unlock()
        continuation.resume(returning: ["done": false, "data": chunk])
        return
      }
      if finished {
        let done = doneValue()
        lock.unlock()
        continuation.resume(returning: done)
        return
      }
      waiters.append(continuation)
      lock.unlock()
    }
  }

  public func cancel() {
    lock.lock()
    let session = self.session
    self.session = nil
    self.finished = true
    self.error = CompanionNetError(message: "Connection closed")
    self.chunks.removeAll()
    self.utf8Pending.removeAll()
    let waiters = self.waiters
    self.waiters.removeAll()
    let done = doneValue()
    lock.unlock()
    session?.invalidateAndCancel()
    for waiter in waiters { waiter.resume(returning: done) }
  }

  /** Keep an incomplete UTF-8 scalar between URLSession byte chunks, including emoji/CJK. Called under lock. */
  private func decodeChunk(_ data: Data, flush: Bool) -> String {
    utf8Pending.append(data)
    var complete = utf8Pending.count
    if !flush && complete > 0 {
      let bytes = [UInt8](utf8Pending)
      var lead = complete - 1
      while lead > 0 && bytes[lead] & 0xC0 == 0x80 { lead -= 1 }
      let byte = bytes[lead]
      let expected = byte & 0xF8 == 0xF0 ? 4 : byte & 0xF0 == 0xE0 ? 3 : byte & 0xE0 == 0xC0 ? 2 : 1
      if expected > complete - lead { complete = lead }
    }
    let text = String(decoding: utf8Pending.prefix(complete), as: UTF8.self)
    utf8Pending.removeFirst(complete)
    return text
  }

  private func doneValue() -> [String: Any] {
    var value: [String: Any] = ["done": true]
    if let status {
      value["status"] = status
    }
    if let error {
      value["error"] = error.localizedDescription
    }
    return value
  }

  open override func sharedObjectWillRelease() {
    cancel()
  }
}

/// Holds a Bonjour browser just long enough for iOS to show the local-network permission dialog.
private final class LocalNetworkWarmup {
  static let shared = LocalNetworkWarmup()
  private var browser: NWBrowser?

  func start() {
    guard browser == nil else { return }
    let next = NWBrowser(for: .bonjour(type: "_cadcamfun._tcp", domain: nil), using: .tcp)
    next.stateUpdateHandler = { _ in }
    next.start(queue: .global(qos: .utility))
    browser = next
    DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 8) { [weak self] in
      self?.browser?.cancel()
      self?.browser = nil
    }
  }
}

public class CompanionNetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CompanionNet")

    // SDK 57 AsyncFunction closures are `throws -> R`, not async: an awaited operation runs in a
    // Task and settles the injected `Promise` (the classic Expo Modules pattern).
    AsyncFunction("request") { (promise: Promise, baseUrl: String, path: String, method: String, headers: [String: String], body: String?, fingerprint: String) in
      Task {
        do {
          let result = try await PinnedTransport.request(baseUrl: baseUrl, path: path, method: method, headers: headers, body: body, fingerprint: fingerprint)
          promise.resolve(result)
        } catch {
          promise.reject(error)
        }
      }
    }

    Function("streamStart") { (baseUrl: String, path: String, method: String, headers: [String: String], body: String?, fingerprint: String) throws -> CompanionStreamHandle in
      let handle = CompanionStreamHandle()
      try handle.start(baseUrl: baseUrl, path: path, method: method, headers: headers, body: body, fingerprint: fingerprint)
      return handle
    }

    Function("launchPairLink") { () -> String? in
      let args = ProcessInfo.processInfo.arguments
      guard let index = args.firstIndex(of: "--pair-link"), args.indices.contains(index + 1) else {
        return nil
      }
      return args[index + 1]
    }

    // First LAN/hotspot HTTPS never triggers the local-network prompt on its own.
    // A Bonjour browse of our unused service type is enough; iOS shows the dialog.
    Function("warmLocalNetwork") {
      LocalNetworkWarmup.shared.start()
    }

    Class(CompanionStreamHandle.self) {
      AsyncFunction("readNext") { (handle: CompanionStreamHandle, promise: Promise) in
        Task {
          promise.resolve(await handle.readNext())
        }
      }
      Function("cancel") { (handle: CompanionStreamHandle) in
        handle.cancel()
      }
    }
  }
}
