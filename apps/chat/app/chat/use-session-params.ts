"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const useSessionParam = (
  key: string,
  defaultValue: string,
): [string, (next: string) => void] => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const raw = searchParams.get(key);
  const value = raw !== null && raw !== "" ? raw : defaultValue;

  const setValue = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === defaultValue || next === "") {
      params.delete(key);
    } else {
      params.set(key, next);
    }
    const query = params.toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`, { scroll: false });
  };

  return [value, setValue];
};

export const useSessionFlag = (
  key: string,
  defaultValue: boolean,
): [boolean, (next: boolean) => void] => {
  const [value, setValue] = useSessionParam(key, defaultValue ? "1" : "");

  const setFlag = (next: boolean) => setValue(next ? "1" : "");

  return [value === "1", setFlag];
};
