import http.server
import socketserver
import ssl
import os

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        clean_path = self.path.split('?')[0].split('#')[0]
        if clean_path in ('', '/'):
            self.path = '/index.html'
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

if __name__ == '__main__':
    port = 8080
    handler = NoCacheHTTPRequestHandler
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), handler) as httpd:
        # Force HTTP by default to avoid Mixed Content blocks when communicating with http:// compiler backends.
        # Change USE_SSL to True only if your compiler server is configured with SSL/HTTPS.
        USE_SSL = False
        if USE_SSL and os.path.exists("cert.pem") and os.path.exists("key.pem"):
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(certfile="cert.pem", keyfile="key.pem")
            httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
            print(f"Serving HTTPS on 0.0.0.0 port {port} (https://0.0.0.0:{port}/) with NO CACHE ...")
        else:
            print(f"Serving HTTP on 0.0.0.0 port {port} (http://localhost:{port}/) with NO CACHE ...")
        httpd.serve_forever()
