//! HTTPS to a paired desktop with the certificate *pinned* by SHA-256 fingerprint.
//!
//! The desktop's gateway uses a self-signed certificate, so the system trust store is useless and a webview `fetch`
//! cannot pin. Every request from the iOS app therefore goes through this crate: the TLS handshake succeeds only when
//! the server's leaf certificate hashes to the fingerprint learned from the pairing QR code. Host names are not checked
//! (the desktop is addressed by LAN IP); the fingerprint is the identity.

use std::sync::Arc;

use futures_util::StreamExt;
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::{ring, verify_tls12_signature, verify_tls13_signature, CryptoProvider};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{DigitallySignedStruct, SignatureScheme};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
pub enum NetError {
    #[error("invalid fingerprint: expected 64 hex characters")]
    InvalidFingerprint,
    #[error("invalid request: {0}")]
    InvalidRequest(String),
    #[error("could not reach the desktop: {0}")]
    Connect(String),
    #[error("request failed: {0}")]
    Request(String),
}

#[derive(Debug, Clone, Deserialize)]
pub struct Request {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub body: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Head {
    pub status: u16,
    pub headers: Vec<(String, String)>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Response {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

pub fn parse_fingerprint(hex: &str) -> Result<[u8; 32], NetError> {
    let hex = hex.trim();
    if hex.len() != 64 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(NetError::InvalidFingerprint);
    }
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16)
            .map_err(|_| NetError::InvalidFingerprint)?;
    }
    Ok(out)
}

#[derive(Debug)]
struct PinnedVerifier {
    fingerprint: [u8; 32],
    provider: Arc<CryptoProvider>,
}

impl ServerCertVerifier for PinnedVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        let digest = Sha256::digest(end_entity.as_ref());
        if digest.as_slice() == self.fingerprint {
            Ok(ServerCertVerified::assertion())
        } else {
            Err(rustls::Error::General(
                "certificate fingerprint does not match the paired desktop".into(),
            ))
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls12_signature(
            message,
            cert,
            dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls13_signature(
            message,
            cert,
            dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider
            .signature_verification_algorithms
            .supported_schemes()
    }
}

fn client(fingerprint: &str) -> Result<reqwest::Client, NetError> {
    let fingerprint = parse_fingerprint(fingerprint)?;
    let provider = Arc::new(ring::default_provider());
    let config = rustls::ClientConfig::builder_with_provider(provider.clone())
        .with_safe_default_protocol_versions()
        .map_err(|e| NetError::Request(e.to_string()))?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(PinnedVerifier {
            fingerprint,
            provider,
        }))
        .with_no_client_auth();
    reqwest::Client::builder()
        .use_preconfigured_tls(config)
        .https_only(true)
        // The desktop never redirects; following one could send the bearer token somewhere unpinned.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| NetError::Request(e.to_string()))
}

fn prepare(client: &reqwest::Client, req: &Request) -> Result<reqwest::RequestBuilder, NetError> {
    let url = url::Url::parse(&req.url).map_err(|e| NetError::InvalidRequest(e.to_string()))?;
    if url.scheme() != "https" {
        return Err(NetError::InvalidRequest(
            "only https URLs are allowed".into(),
        ));
    }
    let method = reqwest::Method::from_bytes(req.method.to_ascii_uppercase().as_bytes())
        .map_err(|e| NetError::InvalidRequest(e.to_string()))?;
    let mut builder = client.request(method, url);
    for (name, value) in &req.headers {
        builder = builder.header(name, value);
    }
    if let Some(body) = &req.body {
        builder = builder.body(body.clone());
    }
    Ok(builder)
}

fn head_of(res: &reqwest::Response) -> Head {
    Head {
        status: res.status().as_u16(),
        headers: res
            .headers()
            .iter()
            .filter_map(|(k, v)| {
                v.to_str()
                    .ok()
                    .map(|v| (k.as_str().to_owned(), v.to_owned()))
            })
            .collect(),
    }
}

fn map_send(e: reqwest::Error) -> NetError {
    if e.is_connect() {
        NetError::Connect(format!("{e:?}"))
    } else {
        NetError::Request(e.to_string())
    }
}

/// One request, whole body in memory (JSON API calls).
pub async fn request(fingerprint: &str, req: &Request) -> Result<Response, NetError> {
    let client = client(fingerprint)?;
    let res = prepare(&client, req)?.send().await.map_err(map_send)?;
    let Head { status, headers } = head_of(&res);
    let body = res
        .bytes()
        .await
        .map_err(|e| NetError::Request(e.to_string()))?
        .to_vec();
    Ok(Response {
        status,
        headers,
        body,
    })
}

/// One request whose body is delivered chunk by chunk (the assistant's SSE stream); returns the head as soon as it arrives.
pub async fn stream<H, C>(
    fingerprint: &str,
    req: &Request,
    on_head: H,
    mut on_chunk: C,
) -> Result<(), NetError>
where
    H: FnOnce(Head),
    C: FnMut(&[u8]),
{
    let client = client(fingerprint)?;
    let res = prepare(&client, req)?.send().await.map_err(map_send)?;
    on_head(head_of(&res));
    let mut body = res.bytes_stream();
    while let Some(chunk) = body.next().await {
        on_chunk(&chunk.map_err(|e| NetError::Request(e.to_string()))?);
    }
    Ok(())
}

#[cfg(test)]
mod tests;
