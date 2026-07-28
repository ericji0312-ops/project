"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="mx-auto max-w-sm p-6 mt-24 space-y-4 text-sm">
      <h1 className="text-xl font-bold text-center">학습스케줄 배정</h1>
      <form action={formAction} className="space-y-3">
        <input
          type="password"
          name="password"
          placeholder="공유 비밀번호"
          className="border rounded px-2 py-1 w-full"
          autoFocus
          required
        />
        {state.error && <p className="text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="bg-blue-600 text-white rounded px-4 py-2 w-full disabled:opacity-40"
        >
          {pending ? "확인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}
