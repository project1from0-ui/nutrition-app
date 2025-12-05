// 1日の目標摂取量を計算
export const calculateDailyIntake = (userProfile) => {
  if (!userProfile) return null;

  // Destructure all necessary fields from the profile object
  const { 
    height, 
    weight, 
    gender, 
    exerciseFrequency, 
    goal,
    birthYear,
    birthMonth,
    birthDay
  } = userProfile;

  // 年齢を計算
  const today = new Date();
  const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  // 基礎代謝量（BMR）をHarris-Benedict式で計算
  let bmr;
  if (gender === 'male') {
    bmr = 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
  } else {
    bmr = 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
  }

  // 活動レベル係数
  const activityMultiplier = {
    none: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9
  };

  // TDEE（総消費カロリー）
  const tdee = bmr * (activityMultiplier[exerciseFrequency] || 1.2);

  // 目標に応じた摂取カロリー
  let targetCalories;
  if (goal === 'diet') {
    targetCalories = tdee - 500; // 減量: -500kcal
  } else if (goal === 'bulk') {
    targetCalories = tdee + 300; // 増量: +300kcal
  } else {
    targetCalories = tdee; // 維持
  }

  // PFCバランス（タンパク質、脂質、炭水化物）
  const proteinGrams = weight * (goal === 'bulk' ? 2.0 : 1.6); // 体重×1.6-2.0g
  const fatGrams = (targetCalories * 0.25) / 9; // 総カロリーの25%を脂質から
  const carbsGrams = (targetCalories - (proteinGrams * 4 + fatGrams * 9)) / 4; // 残りを炭水化物で

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetCalories: Math.round(targetCalories),
    protein: Math.round(proteinGrams),
    fat: Math.round(fatGrams),
    carbs: Math.round(carbsGrams)
  };
};