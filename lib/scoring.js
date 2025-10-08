// Goal-aware ideal ranges & scoring
// NOTE: Stay は暫定的に Slim と同一レンジを使用します

export function getIdealRanges(goal = 'stay') {
  const g = (goal || 'stay').toLowerCase();
  // TODO: ここに「現行の diet/bulk のレンジ実数値」を反映してください。
  // 下は暫定。運用中の値が他ファイルにある場合は、その値で上書きすること。
  const rangesSlim = {
    kcal:    { min: 400, max: 550 },
    protein: { min: 25,  max: 40  },
    fat:     { min: 10,  max: 18  },
    carb:    { min: 40,  max: 70  },
  };
  const rangesBulk = {
    kcal:    { min: 650, max: 850 },
    protein: { min: 30,  max: 40  },
    fat:     { min: 15,  max: 25  },
    carb:    { min: 80,  max: 110 },
  };
  if (g === 'bulk') return rangesBulk;
  return rangesSlim; // 'slim' も 'stay' も同一
}

export function scoreMenuByGoal(nutrients, goal = 'stay') {
  const ranges = getIdealRanges(goal);
  const dist2 = (val, { min, max }) => {
    if (!Number.isFinite(val)) return 0;
    if (val < min) return (min - val) ** 2;
    if (val > max) return (val - max) ** 2;
    return 0;
  };
  return (
    dist2(nutrients.kcal,    ranges.kcal) +
    dist2(nutrients.protein, ranges.protein) +
    dist2(nutrients.fat,     ranges.fat) +
    dist2(nutrients.carb,    ranges.carb)
  );
}

export function gradeMenuByGoal(nutrients, goal = 'stay') {
  // 既存の閾値に合わせて適宜調整可
  const s = scoreMenuByGoal(nutrients, goal);
  if (s <= 50)  return 'S';
  if (s <= 120) return 'A';
  if (s <= 250) return 'B';
  if (s <= 500) return 'C';
  return 'D';
}


