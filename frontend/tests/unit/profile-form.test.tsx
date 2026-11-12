import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProfileForm, type ProfilePayload } from "@/components/auth/profile-form";
import { ApiError } from "@/lib/api";
import type { ProfileField, SiteConfig } from "@/lib/types";

vi.mock("@/components/providers", () => ({
  useSite: () => ({ institute_name: "Test Institute" }) as Partial<SiteConfig>,
}));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  userTimeZone: () => "Asia/Karachi",
}));

const FIELDS: ProfileField[] = [
  { key: "phone", label: "Phone (WhatsApp)", type: "phone", required: true, options: [], help_text: "Include your country code", locked_after_save: false },
  { key: "date_of_birth", label: "Date of birth", type: "date", required: true, options: [], help_text: "", locked_after_save: true },
  { key: "gender", label: "Gender", type: "select", required: true, options: ["Male", "Female"], help_text: "", locked_after_save: true },
  { key: "country", label: "Country", type: "country", required: true, options: [], help_text: "", locked_after_save: false },
  { key: "city", label: "City", type: "text", required: false, options: [], help_text: "", locked_after_save: false },
  { key: "languages", label: "Languages", type: "multiselect", required: false, options: ["Urdu", "English", "Arabic"], help_text: "", locked_after_save: false },
  { key: "bio", label: "About you", type: "textarea", required: false, options: [], help_text: "", locked_after_save: false },
  { key: "years", label: "Years of study", type: "number", required: false, options: [], help_text: "", locked_after_save: false },
];

function setup(overrides: Partial<React.ComponentProps<typeof ProfileForm>> = {}) {
  const onSubmit = vi.fn<(p: ProfilePayload) => Promise<void>>().mockResolvedValue(undefined);
  render(
    <ProfileForm
      fields={FIELDS}
      initial={{ full_name: "Aisha Khan", data: { date_of_birth: "1995-04-02" } }}
      requireConsent
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe("ProfileForm", () => {
  it("renders admin-defined fields with required markers, options and help", () => {
    setup();
    expect(screen.getByLabelText(/Full name/)).toHaveValue("Aisha Khan");
    const phone = screen.getByLabelText(/Phone \(WhatsApp\)/);
    expect(phone).toHaveAttribute("type", "tel");
    expect(phone).toBeRequired();
    expect(screen.getByText("Include your country code")).toBeInTheDocument();

    const phoneLabel = screen.getByText("Phone (WhatsApp)").closest("label")!;
    expect(within(phoneLabel).getByText("*")).toBeInTheDocument();
    const cityLabel = screen.getByText("City").closest("label")!;
    expect(within(cityLabel).queryByText("*")).toBeNull();

    const gender = screen.getByLabelText(/Gender/);
    expect(within(gender).getByRole("option", { name: "Male" })).toBeInTheDocument();
    expect(within(gender).getByRole("option", { name: "Female" })).toBeInTheDocument();

    const country = screen.getByLabelText(/Country/);
    expect(within(country).getByRole("option", { name: "Pakistan" })).toHaveValue("PK");

    expect(screen.getByRole("group", { name: /Languages/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Arabic")).toHaveAttribute("type", "checkbox");
    expect(screen.getByLabelText(/About you/).tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText(/Years of study/)).toHaveAttribute("type", "number");
    expect(screen.getByRole("checkbox", { name: /I consent to Test Institute/ })).toBeInTheDocument();
  });

  it("makes a locked field that already has a value read-only with help text", () => {
    setup();
    const dob = screen.getByLabelText(/Date of birth/);
    expect(dob).toHaveValue("1995-04-02");
    expect(dob).toHaveAttribute("readonly");
    expect(screen.getByText(/can't be changed once saved/)).toBeInTheDocument();
    // Locked but empty fields stay editable
    expect(screen.getByLabelText(/Gender/).tagName).toBe("SELECT");
  });

  it("blocks submit until required fields and consent are filled", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText("This field is required.").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Please give your consent to continue.")).toBeInTheDocument();
  });

  it("submits the mapped payload", async () => {
    const { onSubmit, user } = setup();
    await user.clear(screen.getByLabelText(/Full name/));
    await user.type(screen.getByLabelText(/Full name/), "  Aisha  Khan ");
    await user.type(screen.getByLabelText(/Phone \(WhatsApp\)/), "+92 300 1234567");
    await user.selectOptions(screen.getByLabelText(/Gender/), "Female");
    await user.selectOptions(screen.getByLabelText(/Country/), "PK");
    await user.type(screen.getByLabelText(/City/), "Lahore ");
    await user.click(screen.getByLabelText("Urdu"));
    await user.click(screen.getByLabelText("Arabic"));
    await user.type(screen.getByLabelText(/Years of study/), "3");
    await user.click(screen.getByRole("checkbox", { name: /I consent/ }));
    await user.click(screen.getByRole("button", { name: "Save and continue" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      full_name: "Aisha  Khan",
      data: {
        phone: "+92 300 1234567",
        gender: "Female",
        country: "PK",
        city: "Lahore",
        languages: ["Urdu", "Arabic"],
        bio: "",
        years: "3",
      },
      consent: true,
      timezone: "Asia/Karachi",
    });
    // locked field with a saved value is not re-sent
    expect(onSubmit.mock.calls[0][0].data).not.toHaveProperty("date_of_birth");
  });

  it("shows server field errors next to the right fields", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError(400, "Please fix the highlighted fields.", "invalid", {
        phone: ["Enter a valid phone number with country code."],
        full_name: ["Name is too long."],
      }),
    );
    const { user } = setup({
      onSubmit,
      requireConsent: false,
      initial: { full_name: "Aisha Khan", data: { phone: "123", date_of_birth: "1995-04-02", gender: "Female", country: "PK" } },
    });
    await user.click(screen.getByRole("button", { name: "Save and continue" }));

    expect(onSubmit).toHaveBeenCalled();
    const phone = screen.getByLabelText(/Phone \(WhatsApp\)/);
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveAccessibleDescription("Enter a valid phone number with country code.");
    expect(screen.getByLabelText(/Full name/)).toHaveAccessibleDescription("Name is too long.");
    expect(screen.getByText("Please fix the highlighted fields.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /I consent/ })).toBeNull();
  });
});
