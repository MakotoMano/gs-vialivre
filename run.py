from backend.app import create_app
import argparse
import threading
import webbrowser
import uvicorn

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='ViaLivre — servidor local')
    parser.add_argument('--open', action='store_true', help='Abrir o navegador ao iniciar')
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    application = create_app()
    url = f'http://127.0.0.1:{args.port}'
    print(f'ViaLivre local: {url}', flush=True)
    if args.open:
        timer = threading.Timer(1.5, lambda: webbrowser.open(url))
        timer.daemon = True
        timer.start()
    uvicorn.run(application, host='127.0.0.1', port=args.port)
