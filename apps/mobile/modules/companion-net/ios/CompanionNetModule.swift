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

private func accept(_ challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void, fingerprint: String?) {
  // Only the explicit cloud ABI passes nil. URLSession then verifies PKI trust and the requested hostname.
  guard let fingerprint else {
    completionHandler(.performDefaultHandling, nil)
    return
  }
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
  let fingerprint: String?
  var onResponse: ((Int, [String: String]) -> Void)?
  var onData: ((Data) -> Void)?
  var onComplete: ((Error?) -> Void)?
  var status: Int?
  var headers: [String: String] = [:]

  init(fingerprint: String?) {
    self.fingerprint = fingerprint
  }

  func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    accept(challenge, completionHandler: completionHandler, fingerprint: fingerprint)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    if let response = response as? HTTPURLResponse {
      status = response.statusCode
      for (key, value) in response.allHeaderFields {
        guard let name = key as? String else { continue }
        let lower = name.lowercased()
        if lower == "etag" || lower == "retry-after" { headers[lower] = String(describing: value) }
      }
      onResponse?(response.statusCode, headers)
    }
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
  static func sessionConfiguration() -> URLSessionConfiguration {
    let configuration = URLSessionConfiguration.ephemeral
    // iOS may deny the first LAN attempt before the user answers its permission alert.
    configuration.waitsForConnectivity = true
    return configuration
  }

  /**
   * One-shot request. Implemented on the data-delegate path rather than
   * `URLSession.data(for:)` so the pin evaluator always owns the challenge.
   * Mixing the async convenience API with a `URLSessionDataDelegate` drops
   * the challenge on some iOS versions and pairing then fails as "did not answer".
   */
  static func request(baseUrl: String, path: String, method: String, headers: [String: String], body: String?, fingerprint: String?) async throws -> [String: Any] {
    var request = try makeRequest(baseUrl: baseUrl, path: path, method: method, headers: headers, body: body)
    request.timeoutInterval = 30

    let delegate = PinnedDelegate(fingerprint: fingerprint)
    let configuration = sessionConfiguration()
    configuration.timeoutIntervalForResource = 30
    let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
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
          finish(.failure(CompanionNetError(message: friendly(error, cloud: fingerprint == nil))))
          return
        }
        finish(.success([
          "status": delegate.status ?? 0,
          "headers": delegate.headers,
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

  private static func friendly(_ error: Error, cloud: Bool) -> String {
    let code = (error as NSError).code
    let message = error.localizedDescription
    if code == NSURLErrorCancelled {
      return "Connection closed"
    }
    if code == NSURLErrorCannotFindHost || code == NSURLErrorCannotConnectToHost || code == NSURLErrorNetworkConnectionLost || code == NSURLErrorNotConnectedToInternet || code == NSURLErrorTimedOut {
      if cloud { return "Cannot reach the cloud workspace. Check your internet connection and retry." }
      return "Cannot reach the desktop. Join the same Wi-Fi or Personal Hotspot as the Mac, or type a Tailscale address."
    }
    if code == NSURLErrorSecureConnectionFailed || code == NSURLErrorServerCertificateUntrusted || code == NSURLErrorServerCertificateHasBadDate || code == NSURLErrorServerCertificateNotYetValid || code == NSURLErrorServerCertificateHasUnknownRoot {
      if cloud { return "The cloud workspace's HTTPS certificate could not be verified." }
      return "Certificate does not match the pairing QR code"
    }
    if message.contains("The certificate for this server is invalid") {
      if cloud { return "The cloud workspace's HTTPS certificate could not be verified." }
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
  private var responseHeaders: [String: String] = [:]
  private var waiters: [CheckedContinuation<[String: Any], Never>] = []

  public func start(baseUrl: String, path: String, method: String, headers: [String: String], body: String?, fingerprint: String?) throws {
    let request: URLRequest
    do {
      request = try PinnedTransport.makeRequest(baseUrl: baseUrl, path: path, method: method, headers: headers, body: body)
    } catch {
      throw error
    }

    let delegate = PinnedDelegate(fingerprint: fingerprint)
    let session = URLSession(configuration: PinnedTransport.sessionConfiguration(), delegate: delegate, delegateQueue: nil)
    self.session = session

    delegate.onResponse = { [weak self] status, headers in
      guard let self else { return }
      self.lock.lock()
      self.status = status
      self.responseHeaders = headers
      self.lock.unlock()
    }

    delegate.onData = { [weak self] data in
      guard let self else { return }
      self.lock.lock()
      guard !self.finished else { self.lock.unlock(); return }
      let text = self.decodeChunk(data, flush: false)
      if text.isEmpty { self.lock.unlock(); return }
      if !self.waiters.isEmpty {
        let waiter = self.waiters.removeFirst()
        let value = self.chunkValue(text)
        self.lock.unlock()
        waiter.resume(returning: value)
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
        let value = chunkValue(chunk)
        lock.unlock()
        continuation.resume(returning: value)
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
    var value: [String: Any] = ["done": true, "headers": responseHeaders]
    if let status {
      value["status"] = status
    }
    if let error {
      value["error"] = error.localizedDescription
    }
    return value
  }

  private func chunkValue(_ text: String) -> [String: Any] {
    var value: [String: Any] = ["done": false, "data": text, "headers": responseHeaders]
    if let status { value["status"] = status }
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

    // Expo injects Promise only in the last position; placing it first makes JS calls expect seven arguments.
    AsyncFunction("request") { (baseUrl: String, path: String, method: String, headers: [String: String], body: String?, fingerprint: String, promise: Promise) in
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

    AsyncFunction("cloudRequest") { (baseUrl: String, path: String, method: String, headers: [String: String], body: String?, promise: Promise) in
      Task {
        do {
          let result = try await PinnedTransport.request(baseUrl: baseUrl, path: path, method: method, headers: headers, body: body, fingerprint: nil)
          promise.resolve(result)
        } catch {
          promise.reject(error)
        }
      }
    }

    Function("cloudStreamStart") { (baseUrl: String, path: String, method: String, headers: [String: String], body: String?) throws -> CompanionStreamHandle in
      let handle = CompanionStreamHandle()
      try handle.start(baseUrl: baseUrl, path: path, method: method, headers: headers, body: body, fingerprint: nil)
      return handle
    }

    Function("launchPairLink") { () -> String? in
      let args = ProcessInfo.processInfo.arguments
      guard let index = args.firstIndex(of: "--pair-link"), args.indices.contains(index + 1) else {
        return nil
      }
      return args[index + 1]
    }

    // Warm the local-network prompt; HTTPS also waits for connectivity while the user answers.
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
