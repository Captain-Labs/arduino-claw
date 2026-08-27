# prod_server.py
import logging
from server import app
from waitress import serve
from config import SERVER_HOST, SERVER_PORT

# Configure waitress logging to match standard formats
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("waitress")

if __name__ == '__main__':
    logger.info(f"Starting Waitress production WSGI server on http://{SERVER_HOST}:{SERVER_PORT}")
    serve(app, host=SERVER_HOST, port=SERVER_PORT, threads=8)
