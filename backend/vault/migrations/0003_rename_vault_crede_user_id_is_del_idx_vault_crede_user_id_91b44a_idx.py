# Generated to align index name with Django autodetector

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("vault", "0002_credential_soft_delete_and_encrypted_website"),
    ]

    operations = [
        migrations.RenameIndex(
            model_name="credential",
            new_name="vault_crede_user_id_91b44a_idx",
            old_name="vault_crede_user_id_is_del_idx",
        ),
    ]
