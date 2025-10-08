"use client";

import { useEffect, useState } from "react";
import { getProfile, saveProfile } from "../../lib/profile.js";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState({ name: "", age: "", gender: "", heightCm: "", weightKg: "", goal: "stay" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const p = getProfile();
    setProfile({
      name: p.name || "",
      age: p.age ?? "",
      gender: p.gender || "",
      heightCm: p.heightCm ?? "",
      weightKg: p.weightKg ?? "",
      goal: p.goal || "stay",
    });
  }, []);

  function updateField(key, value) {
    setProfile(prev => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const normalized = {
      ...profile,
      age: profile.age === "" ? null : Number(profile.age),
      heightCm: profile.heightCm === "" ? null : Number(profile.heightCm),
      weightKg: profile.weightKg === "" ? null : Number(profile.weightKg),
    };
    saveProfile(normalized);
    router.push("/");
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-4">
          <Link href="/" className="text-sm text-blue-600">← ホームへ</Link>
        </div>
        <h1 className="text-xl font-bold mb-4">プロフィール設定</h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm mb-1">名前</label>
            <input value={profile.name} onChange={e => updateField("name", e.target.value)} className="w-full h-11 px-3 rounded-xl border border-gray-300" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">年齢</label>
              <input inputMode="numeric" value={profile.age} onChange={e => updateField("age", e.target.value)} className="w-full h-11 px-3 rounded-xl border border-gray-300" />
            </div>
            <div>
              <label className="block text-sm mb-1">性別</label>
              <select value={profile.gender} onChange={e => updateField("gender", e.target.value)} className="w-full h-11 px-3 rounded-xl border border-gray-300">
                <option value="">未選択</option>
                <option value="male">男性</option>
                <option value="female">女性</option>
                <option value="other">その他</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">身長(cm)</label>
              <input inputMode="numeric" value={profile.heightCm} onChange={e => updateField("heightCm", e.target.value)} className="w-full h-11 px-3 rounded-xl border border-gray-300" />
            </div>
            <div>
              <label className="block text-sm mb-1">体重(kg)</label>
              <input inputMode="numeric" value={profile.weightKg} onChange={e => updateField("weightKg", e.target.value)} className="w-full h-11 px-3 rounded-xl border border-gray-300" />
            </div>
          </div>
          {/* 食事の目的 */}
          <div>
            <label className="block text-sm mb-2 font-semibold">食事の目的</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'slim', label: 'Slim' },
                { id: 'stay', label: 'Stay' },
                { id: 'bulk', label: 'Bulk' },
              ].map(opt => (
                <label key={opt.id} className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 cursor-pointer">
                  <input
                    type="radio"
                    name="goal"
                    value={opt.id}
                    checked={profile.goal === opt.id}
                    onChange={e => updateField('goal', e.target.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <button type="submit" disabled={saving} className={`w-full h-11 rounded-xl font-semibold ${saving ? "bg-gray-300" : "bg-blue-600 text-white"}`}>
            {saving ? "保存中..." : "保存"}
          </button>
        </form>
      </div>
    </main>
  );
}


