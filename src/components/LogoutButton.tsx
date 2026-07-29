import { logout } from "@/app/actions/auth";

export default function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="rounded-full bg-red-600 px-3 py-1.5 text-white transition-colors duration-150 hover:bg-red-700 hover:shadow-md"
      >
        로그아웃
      </button>
    </form>
  );
}
