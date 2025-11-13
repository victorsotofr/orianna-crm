import os
import sys
import pandas as pd
from dotenv import load_dotenv
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import smtplib
import time

######################################################################
# CONFIGURATION
######################################################################
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

CONTACT_LIST_PATH = os.path.join(PROJECT_ROOT, "backend", "contact_lists", "contact_list.csv")
TEMPLATE_FR_PATH = os.path.join(PROJECT_ROOT, "backend", "templates", "template_fr.txt")
TEMPLATE_EN_PATH = os.path.join(PROJECT_ROOT, "backend", "templates", "template_en.txt")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "backend", "output")
OLD_OUTPUT_DIR = os.path.join(OUTPUT_DIR, "_Old")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# email configuration — personal logins to fill in the .env file
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_SERVER = os.getenv("SMTP_SERVER")
SMTP_PORT = int(os.getenv("SMTP_PORT"))
FROM_EMAIL = SMTP_USERNAME

# templates
with open(TEMPLATE_FR_PATH, "r", encoding="utf-8") as f:
    template_fr = f.read()

with open(TEMPLATE_EN_PATH, "r", encoding="utf-8") as f:
    template_en = f.read()


######################################################################
# FUNCTIONS
######################################################################
def get_subject(language):
    return f"blablabla * {'API de Structuration de Données' if language == 'French' else 'Structured Data API'}" # Personalize this with your subject line

def fill_template(template, placeholders):
    for key, value in placeholders.items():
        template = template.replace(f"[{key.upper()}]", value)
    return template

def send_email(to_email, subject, body):
    msg = MIMEMultipart()
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg["Subject"] = subject
    msg["Bcc"] = FROM_EMAIL # I put me in Bcc to keep track of sent emails
    msg.attach(MIMEText(body, "html"))
    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception as e:
        return str(e)

def run_from_ui(selected_language=None):
    if selected_language is None:
        while True:
            language = input("Choose language for emails (fr/en): ").strip().lower()
            if language in ['fr', 'en']:
                break
            print("Please enter 'fr' for French or 'en' for English")
    else:
        language = selected_language
    
    language = "French" if language == "fr" else "English"
    
    df = pd.read_csv(CONTACT_LIST_PATH)
    
    required_columns = ['first_name', 'last_name', 'email', 'company'] # Personalize this with your required columns
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        yield f"Error: Missing required columns in CSV: {', '.join(missing_columns)}"
        return

    for _, row in df.iterrows():
        msg = f"...preparing email for {row['first_name']} {row['last_name']} ({row['email']})..."
        yield msg

        subject = get_subject(language)

        placeholders = {
            "FIRST_NAME": row["first_name"],
            "COMPANY": row["company"]
        }

        template = template_fr if language == "French" else template_en
        email_body = fill_template(template, placeholders)

        result = send_email(row["email"], subject, email_body)
        if result is True:
            yield f"✓ Email sent to {row['email']}"
        else:
            yield f"✗ Failed to send email to {row['email']}: {result}"
        
        time.sleep(2)

if __name__ == "__main__":
    if "--no-confirm" not in sys.argv:
        confirm = input("✕  Did you check & download your latest contact list? Type \"yes\" to proceed: ").strip().lower()
        if confirm != "yes":
            print("✕ Aborted.")
            sys.exit()
    
    for message in run_from_ui():
        print(message)
