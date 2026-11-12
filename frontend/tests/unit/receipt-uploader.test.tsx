import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const compress = vi.hoisted(() => vi.fn());
vi.mock("browser-image-compression", () => ({ default: compress }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => () => {} }));

import {
  COMPRESS_OPTIONS,
  ReceiptUploader,
  buildPaymentFormData,
  prepareReceipt,
} from "@/components/account/receipt-uploader";
import { ApiError } from "@/lib/api";

const MB = 1024 * 1024;
function fakeFile(name: string, type: string, size: number, content = "x") {
  const f = new File([content], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

beforeEach(() => {
  compress.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

describe("prepareReceipt", () => {
  it("rejects disallowed types", async () => {
    await expect(prepareReceipt(fakeFile("a.exe", "application/x-msdownload", 1000))).rejects.toThrow(/photo|PDF/);
    expect(compress).not.toHaveBeenCalled();
  });

  it("rejects oversize PDFs", async () => {
    await expect(prepareReceipt(fakeFile("slip.pdf", "application/pdf", 11 * MB), 10)).rejects.toThrow(/maximum is 10 MB/);
  });

  it("passes small PDFs through untouched", async () => {
    const pdf = fakeFile("slip.pdf", "application/pdf", 200_000);
    const out = await prepareReceipt(pdf, 10);
    expect(out.file).toBe(pdf);
    expect(compress).not.toHaveBeenCalled();
  });

  it("compresses photos to ≤1.5MB / 1600px", async () => {
    const photo = fakeFile("receipt.jpg", "image/jpeg", 4.8 * MB);
    const small = fakeFile("receipt.jpg", "image/jpeg", 1.2 * MB);
    compress.mockResolvedValue(small);
    const out = await prepareReceipt(photo, 10);
    expect(compress).toHaveBeenCalledWith(photo, expect.objectContaining({ maxSizeMB: 1.5, maxWidthOrHeight: 1600 }));
    expect(COMPRESS_OPTIONS).toMatchObject({ maxSizeMB: 1.5, maxWidthOrHeight: 1600 });
    expect(out.file.size).toBe(1.2 * MB);
    expect(out.compressed).toBe(true);
    expect(out.originalSize).toBe(4.8 * MB);
  });
});

describe("buildPaymentFormData", () => {
  it("includes receipt, amount, transaction_ref and paid_on", () => {
    const file = fakeFile("r.jpg", "image/jpeg", 1000);
    const fd = buildPaymentFormData({ receipt: file, amount: " 5000 ", transactionRef: " TX-1 ", paidOn: "2026-11-10", bankAccount: 3 });
    expect(fd.get("receipt")).toBeInstanceOf(File);
    expect((fd.get("receipt") as File).name).toBe("r.jpg");
    expect(fd.get("amount")).toBe("5000");
    expect(fd.get("transaction_ref")).toBe("TX-1");
    expect(fd.get("paid_on")).toBe("2026-11-10");
    expect(fd.get("bank_account")).toBe("3");
  });

  it("omits empty optional fields", () => {
    const fd = buildPaymentFormData({ receipt: fakeFile("r.pdf", "application/pdf", 10), amount: "10", transactionRef: "", paidOn: "" });
    expect(fd.has("paid_on")).toBe(false);
    expect(fd.has("bank_account")).toBe(false);
  });
});

describe("ReceiptUploader", () => {
  const bank = [
    {
      id: 1,
      display_name: "Meezan",
      currency: "PKR",
      account_title: "Hikmah",
      bank_name: "Meezan",
      account_number: "PK00",
      swift_code: "",
      branch: "",
      instructions: "",
    },
  ];

  it("shows an error for an oversize file and does not submit", async () => {
    const onSubmit = vi.fn();
    render(<ReceiptUploader price="5000.00" currency="PKR" bankAccounts={bank} onSubmit={onSubmit} maxMb={10} />);
    fireEvent.change(screen.getByTestId("receipt-file"), { target: { files: [fakeFile("big.pdf", "application/pdf", 12 * MB)] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/maximum is 10 MB/);
    await userEvent.click(screen.getByRole("button", { name: /submit for verification/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a disallowed type", async () => {
    render(<ReceiptUploader price="5000" currency="PKR" bankAccounts={bank} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByTestId("receipt-file"), { target: { files: [fakeFile("notes.docx", "application/msword", 1000)] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/photo|PDF/);
  });

  it("compresses a photo, previews it and submits the FormData", async () => {
    const user = userEvent.setup();
    compress.mockResolvedValue(fakeFile("receipt.jpg", "image/jpeg", 1.2 * MB, "compressed-bytes"));
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ReceiptUploader price="5000.00" currency="PKR" bankAccounts={bank} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByTestId("receipt-camera"), { target: { files: [fakeFile("receipt.jpg", "image/jpeg", 4.8 * MB)] } });
    expect(await screen.findByAltText("Receipt preview")).toBeInTheDocument();
    expect(screen.getByText(/compressed from 4\.8 MB/)).toBeInTheDocument();

    expect(screen.getByLabelText(/amount paid/i)).toHaveValue(5000);
    await user.type(screen.getByLabelText(/transaction reference/i), "TX-77");
    fireEvent.change(screen.getByLabelText(/payment date/i), { target: { value: "2020-01-02" } });
    await user.click(screen.getByRole("button", { name: /submit for verification/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const fd = onSubmit.mock.calls[0][0] as FormData;
    // FormData re-wraps the File, so check the bytes: the compressed output is what gets uploaded.
    expect(await (fd.get("receipt") as File).text()).toBe("compressed-bytes");
    expect((fd.get("receipt") as File).name).toBe("receipt.jpg");
    expect(fd.get("amount")).toBe("5000");
    expect(fd.get("transaction_ref")).toBe("TX-77");
    expect(fd.get("paid_on")).toBe("2020-01-02");
    expect(fd.get("bank_account")).toBe("1");
  });

  it("maps server error codes onto fields", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, "Payment date can't be in the future.", "invalid_date"));
    render(<ReceiptUploader price="10" currency="USD" bankAccounts={bank} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId("receipt-file"), { target: { files: [fakeFile("s.pdf", "application/pdf", 1000)] } });
    await screen.findByText("s.pdf");
    await user.click(screen.getByRole("button", { name: /submit for verification/i }));
    expect(await screen.findByText("Payment date can't be in the future.")).toBeInTheDocument();
    expect(screen.getByLabelText(/payment date/i)).toHaveAttribute("aria-invalid", "true");
  });
});
