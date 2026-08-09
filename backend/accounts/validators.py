import re

from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _


class MasterPasswordComplexityValidator:
    """
    Enforce a strong master password policy suitable for a password manager.

    Requirements (OWASP-aligned for high-value secrets):
    - Minimum length enforced separately (12+)
    - At least one uppercase, one lowercase, one digit, one symbol
    """

    def validate(self, password, user=None):
        if not re.search(r"[A-Z]", password):
            raise ValidationError(
                _("Password must contain at least one uppercase letter."),
                code="password_no_upper",
            )
        if not re.search(r"[a-z]", password):
            raise ValidationError(
                _("Password must contain at least one lowercase letter."),
                code="password_no_lower",
            )
        if not re.search(r"\d", password):
            raise ValidationError(
                _("Password must contain at least one digit."),
                code="password_no_digit",
            )
        if not re.search(r"[^A-Za-z0-9]", password):
            raise ValidationError(
                _("Password must contain at least one special character."),
                code="password_no_symbol",
            )

    def get_help_text(self):
        return _(
            "Your password must contain at least 8 characters with uppercase, lowercase, digit, "
            "and special characters."
        )
