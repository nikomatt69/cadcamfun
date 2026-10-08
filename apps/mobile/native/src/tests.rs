use super::*;
use std::net::SocketAddr;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio_rustls::rustls::pki_types::PrivateKeyDer;
use tokio_rustls::TlsAcceptor;

struct Server {
    addr: SocketAddr,
    fingerprint: String,
}

/// A TLS server with a fresh self-signed certificate, answering every request with `reply`.
async fn serve(reply: &'static [u8], body: &'static [u8]) -> Server {
    let certified = rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let der = certified.cert.der().clone();
    let fingerprint = Sha256::digest(der.as_ref())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    let key = PrivateKeyDer::try_from(certified.key_pair.serialize_der()).unwrap();
    let provider = Arc::new(tokio_rustls::rustls::crypto::ring::default_provider());
    let config = tokio_rustls::rustls::ServerConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .unwrap()
        .with_no_client_auth()
        .with_single_cert(vec![der], key)
        .unwrap();
    let acceptor = TlsAcceptor::from(Arc::new(config));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        loop {
            let Ok((tcp, _)) = listener.accept().await else {
                return;
            };
            let acceptor = acceptor.clone();
            tokio::spawn(async move {
                // A failed handshake (the pinning test) simply ends this connection.
                let Ok(mut tls) = acceptor.accept(tcp).await else {
                    return;
                };
                let mut buf = vec![0u8; 8192];
                let mut read = 0;
                while !buf[..read].windows(4).any(|w| w == b"\r\n\r\n") {
                    let n = tls.read(&mut buf[read..]).await.unwrap_or(0);
                    if n == 0 {
                        return;
                    }
                    read += n;
                }
                // Echo the Authorization header the client sent, so the test can see it arrived.
                let request = String::from_utf8_lossy(&buf[..read]).to_string();
                let auth = request
                    .lines()
                    .find(|l| l.to_ascii_lowercase().starts_with("authorization:"))
                    .unwrap_or("")
                    .to_owned();
                let mut out = reply.to_vec();
                out.extend_from_slice(format!("\r\nx-seen-auth: {auth}\r\n\r\n").as_bytes());
                out.extend_from_slice(body);
                let _ = tls.write_all(&out).await;
                let _ = tls.shutdown().await;
            });
        }
    });
    Server { addr, fingerprint }
}

fn get(server: &Server) -> Request {
    Request {
        method: "GET".into(),
        url: format!("https://{}/api/health", server.addr),
        headers: vec![("authorization".into(), "Bearer t".into())],
        body: None,
    }
}

#[tokio::test]
async fn accepts_the_pinned_certificate() {
    // The reply is `status line + headers`; `serve` appends the echo header and the blank line, so use a bodyless 204.
    let server = serve(b"HTTP/1.1 204 No Content\r\nconnection: close", b"").await;
    let res = request(&server.fingerprint, &get(&server)).await.unwrap();
    assert_eq!(res.status, 204);
    assert!(res
        .headers
        .iter()
        .any(|(k, v)| k == "x-seen-auth" && v.contains("Bearer t")));
}

#[tokio::test]
async fn rejects_any_other_certificate() {
    let server = serve(b"HTTP/1.1 204 No Content\r\nconnection: close", b"").await;
    let other = "00".repeat(32);
    let err = request(&other, &get(&server)).await.unwrap_err();
    assert!(
        matches!(err, NetError::Connect(_) | NetError::Request(_)),
        "{err:?}"
    );
}

#[tokio::test]
async fn streams_the_body_in_chunks() {
    let server = serve(b"HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ntransfer-encoding: chunked\r\nconnection: close", b"b\r\ndata: one\n\n\r\n0\r\n\r\n").await;
    let mut head = None;
    let mut body = Vec::new();
    stream(
        &server.fingerprint,
        &get(&server),
        |h| head = Some(h),
        |c| body.extend_from_slice(c),
    )
    .await
    .unwrap();
    assert_eq!(head.unwrap().status, 200);
    assert_eq!(String::from_utf8(body).unwrap(), "data: one\n\n");
}

#[tokio::test]
async fn returns_the_whole_body_of_a_json_call() {
    let server = serve(b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: 11\r\nconnection: close", b"{\"ok\":true}").await;
    let res = request(&server.fingerprint, &get(&server)).await.unwrap();
    assert_eq!(
        (res.status, res.body.as_slice()),
        (200, b"{\"ok\":true}".as_slice())
    );
}

#[test]
fn fingerprint_validation() {
    assert!(parse_fingerprint(&"ab".repeat(32)).is_ok());
    for bad in ["", "xyz", &"ab".repeat(31), &"zz".repeat(32)] {
        assert!(matches!(
            parse_fingerprint(bad),
            Err(NetError::InvalidFingerprint)
        ));
    }
}

#[tokio::test]
async fn refuses_plain_http_before_connecting() {
    let req = Request {
        method: "GET".into(),
        url: "http://127.0.0.1:1/api".into(),
        headers: vec![],
        body: None,
    };
    assert!(matches!(
        request(&"ab".repeat(32), &req).await,
        Err(NetError::InvalidRequest(_))
    ));
}
