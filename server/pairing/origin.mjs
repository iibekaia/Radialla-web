export function pairingOriginAllowed(req, webOrigin) {
  const origin = req.headers.origin;
  return (
    !origin ||
    origin === webOrigin ||
    origin === `https://${req.headers.host}` ||
    origin === `http://${req.headers.host}`
  );
}
