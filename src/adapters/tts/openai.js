import axios from "axios";

export async function generateOpenAI(prompt, minutes = 3, lang = "sv") {
  const apiKey = process.env.OPENAI_API_KEY;
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `Skriv en berättelse på ${minutes} minuter, språk: ${lang}` },
        { role: "user", content: prompt }
      ]
    },
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  return { text: response.data.choices[0].message.content };
}
