"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export const useSessionParam = (key: string, defaultValue: string) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const raw = searchParams.get(key);
  const value = raw !== null && raw !== "" ? raw : defaultValue;

  const setValue = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams);
      if (next === defaultValue || next === "") {
        params.delete(key);
      } else {
        params.set(key, next);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname, defaultValue, key],
  );

  return [value, setValue] as const;
};

export const useSessionFlag = (key: string, defaultValue: boolean) => {
  const [value, setValue] = useSessionParam(key, defaultValue ? "1" : "");

  const setFlag = useCallback(
    (next: boolean) => {
      setValue(next ? "1" : "");
    },
    [setValue],
  );

  return [value === "1", setFlag] as const;
};
