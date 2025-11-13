import pandas as pd
import os
import requests
from datetime import datetime
from dotenv import load_dotenv
import sys

######################################################################
# CONFIGURATION
######################################################################
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(ROOT_DIR, ".env"))

SHEET_ID = "1PX......" # Replace with your Google Sheet ID that you entered on UiForm
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv"

CONTACT_DIR = os.path.join(ROOT_DIR, "backend", "contact_lists")
OLD_DIR = os.path.join(CONTACT_DIR, "_Old")
DEST_PATH = os.path.join(CONTACT_DIR, "contact_list.csv")
TEMP_PATH = os.path.join(CONTACT_DIR, "temp_download.csv")

COLUMNS_TO_KEEP = ["first_name", "last_name", "linkedin", "email", "company"] # Replace with the columns you want to keep, but it depends also on the extraction schema defined in UiForm

######################################################################
# FUNCTIONS
######################################################################
def download_and_clean_sheet(confirm=True):
    if confirm:
        user_input = input("This will overwrite your current contact_list.csv.\n→ A backup will be saved in '_Old'.\nType \"yes\" to proceed: ").strip().lower()
        if user_input != "yes":
            print("✕ Aborted by user.")
            return

    os.makedirs(CONTACT_DIR, exist_ok=True)

    if os.path.exists(DEST_PATH):
        os.makedirs(OLD_DIR, exist_ok=True)
        timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
        backup_filename = f"contact_list_{timestamp}.csv"
        backup_path = os.path.join(OLD_DIR, backup_filename)
        os.rename(DEST_PATH, backup_path)
        print(f"↩︎ Backed up old contact list to: {backup_path}")

    print("⏏︎ Downloading Google Sheet...")
    response = requests.get(CSV_URL, timeout=10)
    response.raise_for_status()

    with open(TEMP_PATH, "wb") as f:
        f.write(response.content)

    print("⌁ Cleaning and filtering columns...")
    df = pd.read_csv(TEMP_PATH)

    missing = [col for col in COLUMNS_TO_KEEP if col not in df.columns]
    if missing:
        print(f"✕ Missing columns in sheet: {missing}")
        return

    df = df[COLUMNS_TO_KEEP]
    df.to_csv(DEST_PATH, index=False)
    os.remove(TEMP_PATH)

    print(f"✓ Saved cleaned contact list to: {DEST_PATH}")

if __name__ == "__main__":
    is_interactive = "--no-confirm" not in sys.argv
    download_and_clean_sheet(confirm=is_interactive)
