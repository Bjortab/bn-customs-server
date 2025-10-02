import axios from "axios";

export async function generateMistral(prompt, minutes = 3, lang = "sv") {
  const apiKey = process.env.MISTRAL_API_KEY;
  const response = await axios.post(
    "https://api.mistral.ai/v1/chat/completions",
    {
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: `Skriv en berättelse på ${minutes} minuter, språk: ${lang}` },
        { role: "user", content: prompt }
      ]
    },
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  return { text: response.data.choices[0].message.content };
}
