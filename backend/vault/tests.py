from django.test import TestCase

from vault.encryption import decrypt, encrypt, generate_key


class EncryptionHelpersTests(TestCase):
    def test_roundtrip(self):
        key = generate_key()
        blob = encrypt("hello vault", key)
        self.assertEqual(decrypt(blob, key), "hello vault")
