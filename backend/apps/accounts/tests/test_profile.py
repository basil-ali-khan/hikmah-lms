import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from apps.accounts.models import ProfileFieldDefinition, User
from apps.accounts.services import (
    export_user_data,
    is_profile_complete,
    missing_profile_fields,
    request_account_deletion,
    update_profile,
)
from apps.core.services import ServiceError
from conftest import UserFactory, make_student

pytestmark = pytest.mark.django_db


def test_email_is_stored_lowercase_and_unique_case_insensitively():
    User.objects.create_user("Ahmed@Example.COM", "x")
    assert User.objects.get_by_natural_key("ahmed@example.com").email == "ahmed@example.com"
    with pytest.raises(IntegrityError):
        User.objects.create_user("AHMED@example.com", "y")


def test_profile_created_automatically():
    user = UserFactory()
    assert user.profile.data == {}


def test_new_user_profile_incomplete_lists_required_fields():
    user = UserFactory()
    missing = missing_profile_fields(user)
    assert {"phone", "date_of_birth", "gender", "country", "city", "privacy_consent"} <= set(missing)
    assert not is_profile_complete(user)


def test_complete_profile_marks_completed():
    user = UserFactory()
    update_profile(
        user,
        full_name="Ahmed Khan",
        data={"phone": "+92 300 1234567", "date_of_birth": "1990-05-01", "gender": "Male", "country": "PK", "city": "Lahore"},
        consent=True,
    )
    user.refresh_from_db()
    assert is_profile_complete(user)
    assert user.profile.completed_at is not None
    assert user.full_name == "Ahmed Khan"


def test_select_field_rejects_unknown_option():
    user = UserFactory()
    with pytest.raises(ValidationError) as exc:
        update_profile(user, data={"gender": "Unknown"}, consent=True)
    assert "gender" in exc.value.message_dict


def test_date_field_validated():
    user = UserFactory()
    with pytest.raises(ValidationError) as exc:
        update_profile(user, data={"date_of_birth": "not-a-date"})
    assert "date_of_birth" in exc.value.message_dict


def test_unknown_keys_are_dropped():
    user = UserFactory()
    update_profile(user, data={"city": "Karachi", "is_staff": True, "hacker": "x"})
    assert "hacker" not in user.profile.data and "is_staff" not in user.profile.data
    user.refresh_from_db()
    assert user.is_staff is False


def test_locked_field_cannot_change_after_first_save():
    user = make_student()
    with pytest.raises(ValidationError) as exc:
        update_profile(user, data={"gender": "Female"})
    assert "gender" in exc.value.message_dict


def test_admin_added_required_field_makes_profile_incomplete_again():
    user = make_student()
    assert is_profile_complete(user)
    ProfileFieldDefinition.objects.create(key="madhab", label="Madhab", field_type="text", required=True, order=99)
    assert not is_profile_complete(user)
    assert "madhab" in missing_profile_fields(user)


def test_inactive_required_field_is_ignored():
    user = make_student()
    ProfileFieldDefinition.objects.create(key="old", label="Old", required=True, active=False)
    assert is_profile_complete(user)


def test_full_name_required():
    user = UserFactory(full_name="")
    update_profile(user, data={"phone": "+1 555 0100", "date_of_birth": "1990-01-01", "gender": "Male",
                               "country": "GB", "city": "London"}, consent=True)
    assert "full_name" in missing_profile_fields(user)


def test_export_contains_profile_but_no_password():
    user = make_student()
    data = export_user_data(user)
    assert data["account"]["email"] == user.email
    assert "password" not in str(data).lower() or "argon2" not in str(data)
    assert data["profile"]["city"] == "Karachi"


def test_deletion_request_once():
    user = make_student()
    request_account_deletion(user, "bye")
    with pytest.raises(ServiceError):
        request_account_deletion(user, "again")
