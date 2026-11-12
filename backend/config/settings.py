"""
Django settings for Hikmah Online.

Every environment-specific or tunable value comes from environment variables
(see backend/.env.example). Product-level configuration (branding, profile fields,
email templates, reminders, feature flags...) lives in the database — see apps.core.
"""

from datetime import timedelta
from pathlib import Path

import environ
from django.utils.csp import CSP

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env", overwrite=False)

# --- Core -------------------------------------------------------------------
DEBUG = env.bool("DEBUG", default=False)
SECRET_KEY = env("SECRET_KEY")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

SITE_URL = env("SITE_URL", default="http://localhost:3000").rstrip("/")  # public web app
API_URL = env("API_URL", default="http://localhost:8000").rstrip("/")  # Django (admin, API)
ADMIN_URL_PATH = env("ADMIN_URL_PATH", default="staff-panel").strip("/")

INSTALLED_APPS = [
    "unfold",
    "unfold.contrib.filters",
    "unfold.contrib.forms",
    "unfold.contrib.import_export",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.humanize",
    # third party
    "rest_framework",
    "drf_spectacular",
    "corsheaders",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "allauth.mfa",
    "allauth.headless",
    "axes",
    "django_q",
    "import_export",
    "anymail",
    # local
    "apps.core",
    "apps.accounts",
    "apps.courses",
    "apps.enrollments",
    "apps.payments",
    "apps.learning",
    "apps.live",
    "apps.assessments",
    "apps.certificates",
    "apps.notifications",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "django.middleware.csp.ContentSecurityPolicyMiddleware",
    "allauth.account.middleware.AccountMiddleware",
    "apps.accounts.middleware.StaffSecurityMiddleware",
    "axes.middleware.AxesMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "django.template.context_processors.csp",
            ],
        },
    },
]

DATABASES = {"default": env.db("DATABASE_URL")}
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE", default=60)
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# --- Auth -------------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = [
    "axes.backends.AxesStandaloneBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
    "django.contrib.auth.backends.ModelBackend",
]
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
PASSWORD_MIN_LENGTH = env.int("PASSWORD_MIN_LENGTH", default=10)
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": PASSWORD_MIN_LENGTH},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
    {"NAME": "apps.accounts.validators.BreachedPasswordValidator"},
]
PWNED_PASSWORD_CHECK = env.bool("PWNED_PASSWORD_CHECK", default=True)

LOGIN_URL = "account_login"
LOGIN_REDIRECT_URL = f"/{ADMIN_URL_PATH}/"

# allauth
ACCOUNT_USER_MODEL_USERNAME_FIELD = None
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*"]
ACCOUNT_SIGNUP_FORM_CLASS = "apps.accounts.forms.SignupForm"
ACCOUNT_EMAIL_VERIFICATION = "optional"  # login allowed; enrolling requires a verified email
ACCOUNT_CONFIRM_EMAIL_ON_GET = False
ACCOUNT_EMAIL_VERIFICATION_SUPPORTS_RESEND = True
ACCOUNT_LOGIN_ON_EMAIL_CONFIRMATION = True
ACCOUNT_LOGOUT_ON_PASSWORD_CHANGE = False
ACCOUNT_PREVENT_ENUMERATION = True
ACCOUNT_EMAIL_CONFIRMATION_EXPIRE_DAYS = env.int("EMAIL_CONFIRMATION_EXPIRE_DAYS", default=3)
ACCOUNT_PASSWORD_RESET_BY_CODE_ENABLED = False
ACCOUNT_DEFAULT_HTTP_PROTOCOL = "https" if not DEBUG else "http"
ACCOUNT_ADAPTER = "apps.accounts.adapters.AccountAdapter"
ACCOUNT_RATE_LIMITS = {
    "login": env("RATE_LIMIT_LOGIN", default="30/m/ip"),
    "login_failed": env("RATE_LIMIT_LOGIN_FAILED", default="10/m/ip,5/5m/key"),
    "signup": env("RATE_LIMIT_SIGNUP", default="20/m/ip"),
    "reset_password": env("RATE_LIMIT_RESET_PASSWORD", default="20/m/ip,5/m/key"),
    "confirm_email": "1/3m/key",
}
SOCIALACCOUNT_ADAPTER = "apps.accounts.adapters.SocialAccountAdapter"
SOCIALACCOUNT_EMAIL_AUTHENTICATION = True  # link Google sign-in to an existing verified email
SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = True
SOCIALACCOUNT_ONLY = False
GOOGLE_OAUTH_CLIENT_ID = env("GOOGLE_OAUTH_CLIENT_ID", default="")
GOOGLE_OAUTH_CLIENT_SECRET = env("GOOGLE_OAUTH_CLIENT_SECRET", default="")
SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "SCOPE": ["openid", "email", "profile"],
        "AUTH_PARAMS": {"prompt": "select_account"},
        "APPS": (
            [{"client_id": GOOGLE_OAUTH_CLIENT_ID, "secret": GOOGLE_OAUTH_CLIENT_SECRET}]
            if GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET
            else []
        ),
        "EMAIL_AUTHENTICATION": True,
    }
}
HEADLESS_ONLY = False  # staff use allauth's server-rendered login + 2FA for the admin
HEADLESS_CLIENTS = ("browser",)
HEADLESS_FRONTEND_URLS = {
    "account_confirm_email": f"{SITE_URL}/verify-email/{{key}}",
    "account_reset_password": f"{SITE_URL}/forgot-password",
    "account_reset_password_from_key": f"{SITE_URL}/reset-password/{{key}}",
    "account_signup": f"{SITE_URL}/signup",
    "socialaccount_login_error": f"{SITE_URL}/login?error=social",
}
MFA_SUPPORTED_TYPES = ["totp", "recovery_codes"]
MFA_TOTP_ISSUER = env("MFA_TOTP_ISSUER", default="Hikmah Online")
STAFF_2FA_REQUIRED = env.bool("STAFF_2FA_REQUIRED", default=True)
STAFF_SESSION_TIMEOUT_MINUTES = env.int("STAFF_SESSION_TIMEOUT_MINUTES", default=60)

# axes (login lockout)
AXES_FAILURE_LIMIT = env.int("LOGIN_MAX_ATTEMPTS", default=5)
AXES_COOLOFF_TIME = timedelta(minutes=env.int("LOCKOUT_MINUTES", default=15))
AXES_LOCKOUT_PARAMETERS = [["username", "ip_address"]]
AXES_USERNAME_CALLABLE = "apps.accounts.security.axes_username"
AXES_RESET_ON_SUCCESS = True
AXES_ENABLED = env.bool("AXES_ENABLED", default=True)
AXES_LOCKOUT_CALLABLE = "apps.accounts.security.lockout_response"

# --- Sessions / cookies / CSRF / CORS ---------------------------------------
SESSION_COOKIE_AGE = env.int("SESSION_COOKIE_AGE", default=60 * 60 * 24 * 14)
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = env.bool("SECURE_COOKIES", default=not DEBUG)
SESSION_COOKIE_DOMAIN = env("SESSION_COOKIE_DOMAIN", default=None) or None
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = False  # the web app reads it to send X-CSRFToken
CSRF_COOKIE_DOMAIN = SESSION_COOKIE_DOMAIN
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=["http://localhost:3000", "http://localhost:8000"])
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000"])
CORS_ALLOW_CREDENTIALS = True

# --- Security headers -------------------------------------------------------
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=False)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_HSTS_SECONDS > 0
SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=False)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SECURE_CSP = {
    "default-src": [CSP.SELF],
    "script-src": [CSP.SELF, CSP.NONCE],
    "style-src": [CSP.SELF, CSP.UNSAFE_INLINE],  # admin theme uses inline styles
    "img-src": [CSP.SELF, "data:", "blob:"],
    "font-src": [CSP.SELF, "data:"],
    "connect-src": [CSP.SELF],
    "frame-ancestors": [CSP.NONE],
    "form-action": [CSP.SELF],
    "base-uri": [CSP.SELF],
    "object-src": [CSP.NONE],
}

# --- REST framework ---------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
        "rest_framework.parsers.FormParser",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": env("THROTTLE_ANON", default="120/min"),
        "user": env("THROTTLE_USER", default="600/min"),
        "verify": env("THROTTLE_VERIFY", default="20/min"),
        "uploads": env("THROTTLE_UPLOADS", default="20/hour"),
        "export": env("THROTTLE_EXPORT", default="5/hour"),
    },
    "EXCEPTION_HANDLER": "apps.core.api.exception_handler",
}
if DEBUG:
    REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"].append("rest_framework.renderers.BrowsableAPIRenderer")

# Hand-written APIViews return explicit dicts; schema inference hints are noise in `check --deploy`.
SILENCED_SYSTEM_CHECKS = ["drf_spectacular.W001", "drf_spectacular.W002"]

SPECTACULAR_SETTINGS = {
    "TITLE": "Hikmah Online API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
}

# --- Files ------------------------------------------------------------------
MEDIA_ROOT = Path(env("MEDIA_ROOT", default=str(BASE_DIR / "media")))
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]
STORAGE_BACKEND = env("STORAGE_BACKEND", default="local")  # local | s3
SIGNED_URL_TTL_SECONDS = env.int("SIGNED_URL_TTL_SECONDS", default=300)
MAX_UPLOAD_MB = env.int("MAX_UPLOAD_MB", default=10)
ALLOWED_UPLOAD_TYPES = env.list(
    "ALLOWED_UPLOAD_TYPES",
    default=["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"],
)
ALLOWED_DOCUMENT_TYPES = env.list(
    "ALLOWED_DOCUMENT_TYPES",
    default=[
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/zip",
    ],
)
DATA_UPLOAD_MAX_MEMORY_SIZE = (MAX_UPLOAD_MB + 1) * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 2_621_440

if STORAGE_BACKEND == "s3":
    _s3 = {
        "bucket_name": env("S3_BUCKET_PRIVATE"),
        "endpoint_url": env("S3_ENDPOINT_URL"),
        "access_key": env("S3_ACCESS_KEY_ID"),
        "secret_key": env("S3_SECRET_ACCESS_KEY"),
        "region_name": env("S3_REGION", default="auto"),
        "default_acl": None,
        "querystring_auth": True,
        "querystring_expire": SIGNED_URL_TTL_SECONDS,
        "file_overwrite": False,
        "signature_version": "s3v4",
    }
    STORAGES = {
        "default": {"BACKEND": "storages.backends.s3.S3Storage", "OPTIONS": {**_s3, "location": "private"}},
        "public": {"BACKEND": "storages.backends.s3.S3Storage", "OPTIONS": {**_s3, "location": "public"}},
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }
else:
    STORAGES = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": str(MEDIA_ROOT / "private"), "base_url": None},
        },
        "public": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": str(MEDIA_ROOT / "public"), "base_url": f"{API_URL}/media-public/"},
        },
        "staticfiles": {
            "BACKEND": (
                "django.contrib.staticfiles.storage.StaticFilesStorage"
                if DEBUG
                else "whitenoise.storage.CompressedManifestStaticFilesStorage"
            )
        },
    }

# --- Email ------------------------------------------------------------------
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", default="localhost")
EMAIL_PORT = env.int("EMAIL_PORT", default=1025)
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=False)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Hikmah Online <no-reply@hikmah.test>")
SERVER_EMAIL = DEFAULT_FROM_EMAIL
ANYMAIL = {"RESEND_API_KEY": env("RESEND_API_KEY", default="")}

# --- Background jobs ----------------------------------------------------------
Q_CLUSTER = {
    "name": "hikmah",
    "orm": "default",
    "workers": env.int("Q_WORKERS", default=2),
    "timeout": 120,
    "retry": 300,
    "max_attempts": 3,
    "sync": env.bool("Q_SYNC", default=False),
    "catch_up": False,
}

# --- Optional integrations ---------------------------------------------------
TURNSTILE_SITE_KEY = env("TURNSTILE_SITE_KEY", default="")
TURNSTILE_SECRET_KEY = env("TURNSTILE_SECRET_KEY", default="")
SENTRY_DSN = env("SENTRY_DSN", default="")
BACKUP_RETENTION_DAYS = env.int("BACKUP_RETENTION_DAYS", default=30)
DEV_SEED_ALLOWED = env.bool("DEV_SEED_ALLOWED", default=DEBUG)

# --- i18n / tz --------------------------------------------------------------
LANGUAGE_CODE = "en"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Admin theme (Unfold) ---------------------------------------------------
from config.unfold import UNFOLD  # noqa: E402,F401

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", default="INFO")},
    "loggers": {
        "weasyprint": {"level": "WARNING"},
        "fontTools": {"level": "WARNING"},
        "axes": {"level": "WARNING"},
    },
}
