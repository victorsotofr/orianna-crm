import os
from dotenv import load_dotenv
import time
import requests
from datetime import datetime
from subprocess import run

######################################################################
# CONFIGURATION
######################################################################
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

WATCH_FOLDER = "/Users/~YourFolderOfInterest"  # Replace with your folder path
SUPPORTED_EXTENSIONS = [".png"]
POLL_INTERVAL_SECONDS = 3

LOG_DIR = os.path.join(PROJECT_ROOT, "backend", "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "upload_logs.txt")

UIFORM_API_ENDPOINT = os.getenv("UIFORM_API_ENDPOINT")
UIFORM_API_KEY = os.getenv("UIFORM_API_KEY")

uploaded_files = set()

######################################################################
# FUNCTIONS
######################################################################
def notify(title, message):
    try:
        run([
            "osascript", "-e",
            f'display notification \"{message}\" with title \"{title}\"'
        ])
    except Exception as e:
        print(f"✕ Notification failed: {e}")

def log_event(status, filename, detail=""):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_FILE, "a") as f:
        f.write(f"[{timestamp}] {status.upper()}: {filename} {detail}\n")

def upload_file(file_path):
    try:
        with open(file_path, "rb") as f:
            files = {"file": f}
            headers = {"Api-Key": UIFORM_API_KEY}
            response = requests.post(UIFORM_API_ENDPOINT, headers=headers, files=files)

        filename = os.path.basename(file_path)

        if response.status_code == 200:
            print(f"✓ Uploaded: {filename}")
            os.remove(file_path)
            print(f"✕ Deleted: {filename}")
            log_event("uploaded", filename)
            notify("Upload Success", f"{filename} sent to UiForm")
        else:
            msg = f"{response.status_code} - {response.text}"
            print(f"✕ Failed to upload {filename}: {msg}")
            log_event("failed", filename, msg)
            notify("Upload Failed", filename)

    except Exception as e:
        print(f"✕ Error uploading {file_path}: {e}")
        log_event("error", file_path, str(e))
        notify("Upload Error", os.path.basename(file_path))


def watch_folder():
    print(f"👀 Watching folder: {WATCH_FOLDER}")
    while True:
        try:
            files = [
                f for f in os.listdir(WATCH_FOLDER)
                if f.lower().endswith(tuple(SUPPORTED_EXTENSIONS))
            ]
            for file_name in files:
                file_path = os.path.join(WATCH_FOLDER, file_name)
                if file_path not in uploaded_files:
                    upload_file(file_path)
                    uploaded_files.add(file_path)
        except Exception as e:
            print(f"✕ Folder watch error: {e}")

        time.sleep(POLL_INTERVAL_SECONDS)

if __name__ == "__main__":
    watch_folder()
