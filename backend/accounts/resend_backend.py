"""
Django email backend that sends via Resend's HTTPS API.

Render free tier blocks outbound SMTP (ports 25/465/587), so Gmail SMTP
cannot work there. Resend uses HTTPS :443, which is allowed.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend


class ResendEmailBackend(BaseEmailBackend):
    api_url = "https://api.resend.com/emails"

    def send_messages(self, email_messages) -> int:
        api_key = (getattr(settings, "RESEND_API_KEY", "") or "").strip()
        if not api_key:
            if not self.fail_silently:
                raise RuntimeError(
                    "RESEND_API_KEY is not set. Required on Render free tier "
                    "(SMTP ports are blocked)."
                )
            return 0

        sent = 0
        for message in email_messages:
            try:
                self._send_one(api_key, message)
                sent += 1
            except Exception:
                if not self.fail_silently:
                    raise
        return sent

    def _send_one(self, api_key: str, message) -> None:
        payload: dict = {
            "from": message.from_email
            or getattr(settings, "DEFAULT_FROM_EMAIL", "KeySafe <onboarding@resend.dev>"),
            "to": list(message.to),
            "subject": message.subject or "KeySafe",
        }
        if message.body:
            payload["text"] = message.body
        if getattr(message, "alternatives", None):
            for content, mimetype in message.alternatives:
                if mimetype == "text/html":
                    payload["html"] = content
                    break
        if message.cc:
            payload["cc"] = list(message.cc)
        if message.bcc:
            payload["bcc"] = list(message.bcc)
        if message.reply_to:
            payload["reply_to"] = list(message.reply_to)

        request = urllib.request.Request(
            self.api_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                if response.status >= 400:
                    body = response.read().decode("utf-8", errors="replace")
                    raise RuntimeError(f"Resend HTTP {response.status}: {body}")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Resend HTTP {exc.code}: {body}") from exc
