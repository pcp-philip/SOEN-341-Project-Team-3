import { extractResumeText } from "../utils/extractResumeText.js";
import Applicant from "../models/Applicant.js";
import JobPosting from "../models/JobPosting.js";
import Application from "../models/Application.js";

/* ------------------------------------------------------------------ */
/* 1) Resume review  ！  GET /api/resume/suggestions                    */
/* ------------------------------------------------------------------ */
export const getResumeSuggestions = async (req, res) => {
    try {
        const GEMINI_KEY = process.env.GEMINI_API_KEY;
        const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

        if (!GEMINI_KEY || GEMINI_KEY === "CHANGE_ME") {
            return res
                .status(500)
                .json({ message: "AI service not configured ！ set GEMINI_API_KEY" });
        }

        console.log("1. handler entered");

        const user = await Applicant.findById(req.user._id);
        if (!user?.resume?.path) {
            return res.status(404).json({ message: "No resume uploaded" });
        }
        console.log("2. user loaded, resume path:", user.resume.path);

        let resumeText;
        try {
            resumeText = await Promise.race([
                extractResumeText(user.resume.path),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("PDF extraction timed out")), 15000)
                ),
            ]);
        } catch (err) {
            console.error("PDF extraction failed:", err.message);
            return res
                .status(500)
                .json({ message: "Could not read PDF: " + err.message });
        }
        console.log("3. text extracted, length:", resumeText?.length);

        if (!resumeText || resumeText.trim().length < 50) {
            return res
                .status(400)
                .json({ message: "Could not extract readable text from PDF" });
        }

        const prompt = `You are a resume reviewer. Analyze the following resume text.
Return a JSON object with this exact structure:
{
  "overall_score": number (0-100),
  "strengths": string[] (3 items),
  "improvements": string[] (3-5 actionable items),
  "missing_keywords": string[] (5 likely keywords for the candidate's field that are absent),
  "rewrite_example": { "original": string, "improved": string }
}

IMPORTANT RULES:
- Do NOT invent experience, skills, or achievements.
- Only suggest based on what is present in the text.
- The rewrite example should pick ONE weak bullet point from the resume and improve it using only existing information.

RESUME TEXT:
${resumeText.slice(0, 8000)}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

        const body = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3,
                responseMimeType: "application/json",
            },
        };

        console.log("4. calling Gemini with model:", GEMINI_MODEL);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        let response;
        try {
            response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": GEMINI_KEY,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
        } catch (err) {
            if (err.name === "AbortError") {
                console.error("Gemini request timed out after 60s");
                return res.status(504).json({ message: "AI request timed out. Please try again." });
            }
            throw err;
        } finally {
            clearTimeout(timeout);
        }

        console.log("5. Gemini responded with status:", response.status);

        const rawBody = await response.text();

        if (!response.ok) {
            console.error("Gemini API error:", rawBody);
            return res
                .status(502)
                .json({ message: "AI service unavailable ！ see server logs" });
        }

        let data;
        try {
            data = JSON.parse(rawBody);
        } catch (err) {
            console.error("Could not parse Gemini JSON envelope:", rawBody.slice(0, 500));
            return res.status(502).json({ message: "AI returned malformed response" });
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            console.error("Gemini no text:", JSON.stringify(data, null, 2));
            return res.status(502).json({ message: "AI returned an empty response" });
        }

        const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

        let suggestions;
        try {
            suggestions = JSON.parse(cleaned);
        } catch (err) {
            console.error("Could not parse AI JSON output:", cleaned.slice(0, 500));
            return res
                .status(502)
                .json({ message: "AI output was not valid JSON ！ see server logs" });
        }

        console.log("6. suggestions parsed successfully");

        res.json({ suggestions });
    } catch (err) {
        console.error("Suggestion error:", err);
        res.status(500).json({ message: err.message });
    }
};

/* ------------------------------------------------------------------ */
/* 2) AI job matches  ！  GET /api/resume/job-matches                   */
/* ------------------------------------------------------------------ */
export const getJobMatches = async (req, res) => {
    try {
        const GEMINI_KEY = process.env.GEMINI_API_KEY;
        const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

        if (!GEMINI_KEY || GEMINI_KEY === "CHANGE_ME") {
            return res
                .status(500)
                .json({ message: "AI service not configured ！ set GEMINI_API_KEY" });
        }

        console.log("1. [job-matches] handler entered");

        const user = await Applicant.findById(req.user._id);
        if (!user?.resume?.path) {
            return res.status(404).json({ message: "No resume uploaded" });
        }
        console.log("2. [job-matches] user loaded, resume path:", user.resume.path);

        let resumeText;
        try {
            resumeText = await Promise.race([
                extractResumeText(user.resume.path),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("PDF extraction timed out")), 15000)
                ),
            ]);
        } catch (err) {
            console.error("[job-matches] PDF extraction failed:", err.message);
            return res
                .status(500)
                .json({ message: "Could not read PDF: " + err.message });
        }
        console.log("3. [job-matches] text extracted, length:", resumeText?.length);

        if (!resumeText || resumeText.trim().length < 50) {
            return res
                .status(400)
                .json({ message: "Could not extract readable text from PDF" });
        }

        const appliedJobIds = await Application.find({
            applicant: req.user._id,
        }).distinct("job");

        const jobs = await JobPosting.find({
            status: "open",
            _id: { $nin: appliedJobIds },
        })
            .select(
                "title company location remote type description requirements salaryMin salaryMax createdAt"
            )
            .sort({ createdAt: -1 })
            .limit(40)
            .lean();

        console.log(
            `4. [job-matches] ${jobs.length} open jobs to evaluate ` +
            `(excluded ${appliedJobIds.length} already-applied)`
        );

        // Case A: no open jobs at all
        if (!jobs.length) {
            console.log("[job-matches] returning empty ！ no open jobs in database");
            return res.json({
                profileSummary: "",
                matches: [],
                evaluatedCount: 0,
                message: "There are no open jobs to match against right now.",
            });
        }

        const catalog = jobs.map((j) => ({
            id: String(j._id),
            title: j.title,
            company: j.company,
            location: j.location || (j.remote ? "Remote" : ""),
            type: j.type,
            requirements: (j.requirements || []).slice(0, 12),
            description: (j.description || "").slice(0, 500),
        }));

        const prompt = `You match a candidate's resume to job postings.

Return a JSON object with this exact structure:
{
  "profileSummary": string (one sentence about the candidate),
  "matches": [
    {
      "jobId": string (from the catalog below),
      "score": number (0-100),
      "matchedSkills": string[] (max 6 short tokens),
      "missingSkills": string[] (max 6 short tokens),
      "reason": string (1-2 sentences on why this is a fit)
    }
  ]
}

IMPORTANT RULES:
- Include ONE entry per job in the catalog.
- score: 0 = unrelated, 100 = perfect. Weigh skills, seniority, and domain.
- Even weak fits should get a score (e.g., 20-40); do NOT return an empty list unless the catalog is empty.
- Only reference skills present in the resume or job text; do not invent.
- Sort matches descending by score.

=== RESUME TEXT ===
${resumeText.slice(0, 8000)}

=== JOBS (JSON) ===
${JSON.stringify(catalog)}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

        const body = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3,
                responseMimeType: "application/json",
            },
        };

        console.log(
            `5. [job-matches] calling Gemini with model: ${GEMINI_MODEL} ` +
            `(prompt chars: ${prompt.length})`
        );

        const MAX_RETRIES = 3;
        const attemptOnce = async () => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000);
            try {
                const r = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": GEMINI_KEY,
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });
                return { response: r, timedOut: false };
            } catch (err) {
                if (err.name === "AbortError") return { response: null, timedOut: true };
                throw err;
            } finally {
                clearTimeout(timeout);
            }
        };

        let response = null;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const { response: r, timedOut } = await attemptOnce();

            if (timedOut) {
                console.error(`[job-matches] attempt ${attempt + 1} timed out after 60s`);
                if (attempt < MAX_RETRIES) {
                    const waitMs = Math.pow(2, attempt) * 1000;
                    console.log(`   retrying in ${waitMs}ms...`);
                    await new Promise((res) => setTimeout(res, waitMs));
                    continue;
                }
                return res
                    .status(504)
                    .json({ message: "AI request timed out. Please try again." });
            }

            if (r.status === 503 && attempt < MAX_RETRIES) {
                const waitMs = Math.pow(2, attempt) * 1000;
                console.warn(
                    `[job-matches] attempt ${attempt + 1} got 503 (model overloaded), ` +
                    `retrying in ${waitMs}ms...`
                );
                await new Promise((res) => setTimeout(res, waitMs));
                continue;
            }

            response = r;
            break;
        }

        console.log("6. [job-matches] Gemini responded with status:", response.status);

        const rawBody = await response.text();

        if (!response.ok) {
            console.error("Gemini API error (job matches):", rawBody);
            let message = "AI service unavailable ！ see server logs";
            if (response.status === 503) {
                message =
                    "AI model is overloaded right now (503). Please try again in a minute, " +
                    "or switch GEMINI_MODEL in .env to a less busy model.";
            }
            return res.status(502).json({ message });
        }

        let data;
        try {
            data = JSON.parse(rawBody);
        } catch (err) {
            console.error(
                "Could not parse Gemini JSON envelope (job matches):",
                rawBody.slice(0, 500)
            );
            return res
                .status(502)
                .json({ message: "AI returned malformed response" });
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            console.error(
                "Gemini no text (job matches):",
                JSON.stringify(data, null, 2)
            );
            return res
                .status(502)
                .json({ message: "AI returned an empty response" });
        }

        const cleaned = text
            .replace(/^```json\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();

        let ai;
        try {
            ai = JSON.parse(cleaned);
        } catch (err) {
            console.error(
                "Could not parse AI job-match JSON:",
                cleaned.slice(0, 500)
            );
            return res
                .status(502)
                .json({ message: "AI output was not valid JSON ！ see server logs" });
        }

        console.log("7. [job-matches] AI output parsed");

        const aiMatches = Array.isArray(ai?.matches) ? ai.matches : [];
        const jobMap = new Map(jobs.map((j) => [String(j._id), j]));

        const matches = aiMatches
            .map((m) => {
                const job = jobMap.get(String(m.jobId));
                if (!job) return null;
                return {
                    job,
                    score: Math.max(0, Math.min(100, Number(m.score) || 0)),
                    matchedSkills: Array.isArray(m.matchedSkills)
                        ? m.matchedSkills.slice(0, 6)
                        : [],
                    missingSkills: Array.isArray(m.missingSkills)
                        ? m.missingSkills.slice(0, 6)
                        : [],
                    reason: typeof m.reason === "string" ? m.reason : "",
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        console.log(
            `7b. [job-matches] AI returned ${aiMatches.length} raw matches, ` +
            `${matches.length} valid after hydration (out of ${jobs.length} jobs evaluated)`
        );

        // Case B: Gemini evaluated jobs but decided none fit
        if (matches.length === 0) {
            const reason = aiMatches.length === 0
                ? `We compared your resume against ${jobs.length} open job${jobs.length === 1 ? "" : "s"}, but none were a close match.`
                : `The AI returned results we couldn't interpret. Please try again.`;
            console.log(`[job-matches] returning empty ！ ${reason}`);
            return res.json({
                profileSummary: ai?.profileSummary || "",
                matches: [],
                evaluatedCount: jobs.length,
                message: reason,
            });
        }

        // Case C: matches found
        res.json({
            profileSummary:
                typeof ai?.profileSummary === "string" ? ai.profileSummary : "",
            matches,
            evaluatedCount: jobs.length,
        });
    } catch (err) {
        console.error("Job match error:", err);
        res.status(500).json({ message: err.message });
    }
};