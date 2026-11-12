import uuid

from django.conf import settings
from django.db import models

from apps.core.files import randomized_name
from apps.core.models import public_storage

DEFAULT_CERTIFICATE_HTML = """<div class="page">
  <div class="frame"></div>
  {% if logo_url %}<img class="logo" src="{{ logo_url }}" alt="">{% else %}<div class="mark"></div>{% endif %}
  <div class="kicker">{{ institute_name|upper }}</div>
  <h1>{{ title }}</h1>
  <p class="lead">This is to certify that</p>
  <div class="name">{{ student_name }}</div>
  <p class="lead">has successfully completed the course</p>
  <div class="course">{{ course_title }}</div>
  <p class="meta">{% if course_meta %}{{ course_meta }} · {% endif %}completed on {{ completed_on }}{% if grade %} · {{ grade }}{% endif %}</p>
  <div class="foot">
    <div class="id"><small>Certificate ID</small><b>{{ code }}</b><small>Verify at {{ verify_url }}</small></div>
    <div class="sign">{% if signature_url %}<img src="{{ signature_url }}" alt="">{% endif %}<span class="line"></span>
      <span>{{ signatory_name }}</span><small>{{ signatory_title }}</small></div>
    <div class="qr"><img src="{{ qr_data_uri }}" alt=""><small>Scan to verify</small></div>
  </div>
</div>"""

DEFAULT_CERTIFICATE_CSS = """@page { size: A4 landscape; margin: 0; }
body { margin: 0; font-family: 'Roboto', 'Helvetica', sans-serif; color: {{ color_text }}; }
.page { position: relative; width: 297mm; height: 210mm; box-sizing: border-box; border: 6mm solid {{ color_primary }};
  padding: 18mm 26mm; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.frame { position: absolute; inset: 4mm; border: 0.8mm solid {{ color_accent }}; }
.mark { width: 18mm; height: 18mm; border-radius: 4mm; background: {{ color_primary }}; border: 1.6mm solid {{ color_accent }}; }
.logo { max-height: 20mm; max-width: 80mm; }
.kicker { margin-top: 5mm; font-size: 10pt; letter-spacing: 0.25em; color: {{ color_heading }}; font-weight: 700; }
h1 { margin: 3mm 0 4mm; font-size: 30pt; color: {{ color_primary }}; }
.lead { margin: 1mm 0; font-size: 12pt; color: #4A5563; }
.name { font-size: 28pt; font-weight: 700; border-bottom: 0.4mm solid #DADADA; padding: 0 12mm 2mm; margin: 2mm 0 3mm; }
.course { font-size: 18pt; font-weight: 700; margin-top: 2mm; }
.meta { font-size: 10.5pt; color: #4A5563; }
.foot { margin-top: 10mm; width: 100%; display: flex; justify-content: space-between; align-items: flex-end; }
.foot small { display: block; font-size: 8pt; color: #5A6472; }
.id { text-align: left; } .id b { font-family: monospace; font-size: 12pt; }
.sign { display: flex; flex-direction: column; align-items: center; font-size: 10pt; }
.sign img { max-height: 14mm; } .line { width: 60mm; border-top: 0.3mm solid #1E1F25; margin: 1mm 0; }
.qr img { width: 26mm; height: 26mm; }"""


class CertificateTemplate(models.Model):
    name = models.CharField(max_length=120)
    is_default = models.BooleanField(default=False)
    title_text = models.CharField(max_length=120, default="Certificate of Completion")
    signatory_name = models.CharField(max_length=120, blank=True)
    signatory_title = models.CharField(max_length=120, blank=True)
    signature_image = models.ImageField(upload_to="certificates/", storage=public_storage, blank=True)
    show_grade = models.BooleanField(default=False)
    html = models.TextField(default=DEFAULT_CERTIFICATE_HTML, help_text="Django template; variables only.")
    css = models.TextField(default=DEFAULT_CERTIFICATE_CSS)

    def __str__(self):
        return self.name + (" (default)" if self.is_default else "")

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_default:
            CertificateTemplate.objects.exclude(pk=self.pk).update(is_default=False)


class Certificate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=20, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="certificates")
    course = models.ForeignKey("courses.Course", on_delete=models.PROTECT, related_name="certificates")
    student_name = models.CharField(max_length=150, help_text="Name as printed")
    issued_at = models.DateTimeField(auto_now_add=True)
    completed_on = models.DateField()
    pdf = models.FileField(upload_to=randomized_name("certificates"), blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.TextField(blank=True)
    revoked_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        unique_together = [("user", "course")]
        ordering = ["-issued_at"]

    def __str__(self):
        return f"{self.code} · {self.student_name}"

    @property
    def is_valid(self):
        return self.revoked_at is None
