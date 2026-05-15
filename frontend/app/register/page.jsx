"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth-context";
import {
  BrandNav,
  PageBackground
} from "../components/wanted-ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function RegisterPage() {
  const router = useRouter();
  const auth = useAuth();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    city: "",
    password: "",
    confirmPassword: ""
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [fields, setFields] = useState({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const generatedAvatar = useMemo(
    () => buildAvatarUrl(form.username || form.email || "wanted"),
    [form.username, form.email]
  );
  const posterAvatar = avatarPreview || generatedAvatar;

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  function update(key, value) {
    setForm({ ...form, [key]: value });
    setFields({ ...fields, [key]: "" });
  }

  function chooseAvatar(file) {
    setFields({ ...fields, avatar: "" });

    if (!file) {
      setAvatarFile(null);
      return;
    }

    const error = validateAvatarFile(file);
    if (error) {
      setFields({ ...fields, avatar: error });
      setAvatarFile(null);
      return;
    }

    setAvatarFile(file);
  }

  async function submit(event) {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setFields({});

    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => body.append(key, value));
      if (avatarFile) body.append("avatar", avatarFile);

      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        body
      });
      const payload = await response.json();
      if (!response.ok) {
        setFields(payload.fields ?? {});
        throw new Error(payload.error ?? "Registration failed.");
      }
      auth.applySession(payload);
      router.push("/play");
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <PageBackground>
      <BrandNav active="register" compact />
      <div className="mx-auto grid min-h-[calc(100vh-88px)] max-w-7xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <section>
          <p className="text-xs font-black uppercase text-red-300">WANTED CHECKERS</p>
          <h1 className="mt-3 text-5xl font-black uppercase tracking-normal text-amber-100 sm:text-7xl">
            Create Your Poster
          </h1>
          <div className="wanted-poster mt-8 max-w-sm">
            <p className="text-sm font-black uppercase">Wanted</p>
            <img
              src={posterAvatar}
              alt=""
              className="my-4 aspect-square w-full rounded-md border-4 border-stone-950 object-cover"
            />
            <p className="text-3xl font-black tracking-normal">{form.username || "rookie_name"}</p>
            <p className="mt-1 font-bold">{form.city || "Unknown Waters"}</p>
          </div>
        </section>

        <form
          onSubmit={submit}
          className="poster-panel grid gap-4 p-5 sm:grid-cols-2"
        >
          <Field label="First Name" value={form.firstName} error={fields.firstName} onChange={(value) => update("firstName", value)} />
          <Field label="Last Name" value={form.lastName} error={fields.lastName} onChange={(value) => update("lastName", value)} />
          <Field label="Username" value={form.username} error={fields.username} onChange={(value) => update("username", value)} />
          <Field label="Email" type="email" value={form.email} error={fields.email} onChange={(value) => update("email", value)} />
          <Field label="City" value={form.city} error={fields.city} onChange={(value) => update("city", value)} />
          <AvatarField error={fields.avatar} onChange={chooseAvatar} />
          <Field label="Password" type="password" value={form.password} error={fields.password} onChange={(value) => update("password", value)} />
          <Field label="Confirm Password" type="password" value={form.confirmPassword} error={fields.confirmPassword} onChange={(value) => update("confirmPassword", value)} />

          {error ? <p className="rounded-md bg-red-950/80 px-3 py-2 text-sm text-red-100 sm:col-span-2">{error}</p> : null}

          <button
            type="submit"
            disabled={isLoading}
            className="poster-button sm:col-span-2 disabled:cursor-wait disabled:opacity-60"
          >
            Register
          </button>

          <p className="text-center text-sm text-stone-400 sm:col-span-2">
            Already wanted?{" "}
            <a href="/login" className="font-bold text-amber-300 hover:text-amber-200">
              Login
            </a>
          </p>
        </form>
      </div>
    </PageBackground>
  );
}

function AvatarField({ error, onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-black uppercase text-stone-800">Avatar Image</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        className="mt-2 block w-full rounded-md border border-stone-950/50 bg-stone-950/15 px-3 py-2 text-sm font-bold text-stone-950 outline-none transition file:mr-3 file:rounded-md file:border-0 file:bg-stone-950 file:px-3 file:py-2 file:font-bold file:text-amber-200 focus:border-red-900"
      />
      <span className="mt-1 block text-xs font-semibold text-stone-700">JPG, PNG, or WebP. Max 2MB.</span>
      {error ? <span className="mt-1 block text-xs font-semibold text-red-300">{error}</span> : null}
    </label>
  );
}

function Field({ label, value, onChange, error, type = "text" }) {
  return (
    <label className="block">
      <span className="text-sm font-black uppercase text-stone-800">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-md border border-stone-950/50 bg-stone-950/15 px-3 font-bold text-stone-950 outline-none transition focus:border-red-900"
      />
      {error ? <span className="mt-1 block text-xs font-semibold text-red-300">{error}</span> : null}
    </label>
  );
}

function buildAvatarUrl(seed) {
  return `${API_URL}/api/avatars/default/${encodeURIComponent(seed)}`;
}

function validateAvatarFile(file) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

  if (!allowedTypes.includes(file.type) || !allowedExtensions.includes(extension)) {
    return "Avatar must be a JPG, PNG, or WebP image.";
  }
  if (file.size > 2 * 1024 * 1024) {
    return "Avatar must be 2MB or smaller.";
  }
  return "";
}
