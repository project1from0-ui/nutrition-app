// app/api/advice/route.js
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  // 1. Extract data from the client's request
  const { profile, menu, grade } = await request.json();

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key is not configured' }, { status: 500 });
  }

  // 2. Construct a detailed prompt for the LLM
  const prompt = `
    You are a nutrition advisor. Based on the following user profile and the meal they ate, provide personalized, actionable, and encouraging advice in one short paragraphs in Japanese.

    User Profile:
    - Age: ${profile.age || 'N/A'}
    - Gender: ${profile.gender}
    - Height: ${profile.height} cm
    - Weight: ${profile.weight} kg
    - Goal: ${profile.goal === 'diet' ? 'Dieting' : 'Bulking up'}

    Chosen Meal:
    - Name: ${menu.menu}
    - Calories: ${menu.calories} kcal
    - Protein: ${menu.protein} g
    - Fat: ${menu.fat} g
    - Carbs: ${menu.carbs} g

    Our system gave this meal a grade of "${grade}".

    Your advice should be friendly and easy to understand.`;

  // 3. Call the OpenAI API
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo', // Or another model like gpt-4
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API Error:', errorData);
      return NextResponse.json({ error: 'Failed to get advice from AI' }, { status: response.status });
    }

    const data = await response.json();
    const advice = data.choices[0]?.message?.content.trim() || "No advice could be generated at this time.";

    // 4. Return the advice to the client
    return NextResponse.json({ advice });

  } catch (error) {
    console.error('Failed to fetch from OpenAI:', error);
    return NextResponse.json({ error: 'An error occurred while fetching advice.' }, { status: 500 });
  }
}