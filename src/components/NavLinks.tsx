"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE_LINKS = [
  { href: "/", label: "배정화면" },
  { href: "/upload", label: "엑셀 업로드" },
  { href: "/students", label: "학생 관리" },
];

const ADMIN_LINKS = [{ href: "/teachers", label: "선생님 관리" }];

export default function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...BASE_LINKS, ...ADMIN_LINKS] : BASE_LINKS;

  return (
    <div className="flex gap-1">
      {links.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-full px-3 py-1.5 transition-colors duration-150 ${
              active
                ? "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md"
                : "text-gray-700 hover:bg-gray-100 hover:shadow-sm dark:text-gray-300 dark:hover:bg-neutral-800"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
