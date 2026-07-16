export const isAnonymousAccountEmail = (email: string): boolean =>
  email.trim().toLowerCase().endsWith("@anonymous.emi.invalid");

export const startAnonymousSession = async (): Promise<boolean> => {
  try {
    const response = await fetch("/api/auth/sign-in/anonymous", { method: "POST" });
    return response.ok;
  } catch {
    return false;
  }
};
