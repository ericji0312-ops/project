import { logout } from "@/app/actions/auth";

export default function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="text-gray-500 hover:underline">
        로그아웃
      </button>
    </form>
  );
}
