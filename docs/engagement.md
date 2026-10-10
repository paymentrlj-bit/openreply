# Smart replies

Smart replies answer comments and direct messages that no campaign handles, in the person's own language, and keep a person in the loop for anything sensitive. It runs inside the existing worker and is **off until you switch it on**.

## What it does

**Comments** (on your posts, not matched by a keyword campaign):

| The comment is | What happens |
| --- | --- |
| Praise or thanks | A short public reply in the same language and script |
| Only emoji | A short thank-you |
| A price or rate question | A public reply inviting them to comment `RATE` |
| A location question | A public reply inviting them to comment `LOCATION` |
| Any other question | A public reply asking them to send a DM |
| A complaint | **No public reply.** One private message asks what happened, and you get an email |
| Spam, abuse, unclear | Nothing |

**Direct messages** (not matched by a keyword campaign):

| The message is | What happens |
| --- | --- |
| An emoji or a short thanks | A short thank-you, at most once per person per day |
| Anything else | **No automatic reply.** You get an email so you can answer personally |

Languages: English, Marathi in Devanagari, Marathi typed in English letters, Hindi and Hinglish. The reply always matches the language and script of the message.

A keyword campaign always wins: if a campaign handles a comment or message, smart replies leave it alone.

## What it will not do

- **Like comments.** Instagram's API does not allow it. The daily summary lists comments worth liking by hand.
- Quote prices, rates, discounts or offers, or write numbers, links, phone numbers or `@mentions`. Every reply is checked for this, and a reply that fails is replaced by a fixed template, never posted.
- Reply to a comment inside a thread, or to anything older than 24 hours.
- Reply to attachment-only messages (a shared post, a photo).

## Safeguards

- **Test mode first.** In `dry-run` it decides and records everything but sends nothing.
- Each live reply is held back by a random 45 seconds to 10 minutes.
- At most 20 replies an hour and 120 a day by default.
- A model that is unsure (below 70 percent confident) does nothing, or sends the item to you.
- Customer text is wrapped so it cannot give the model instructions.
- If a send fails in a way that might still have gone out, it is never retried.
- `off` is a kill switch.

## Set up

1. **Deploy order matters.** Merge the pull request, wait for the Vercel production deploy to finish (it creates the new `EngagementLog` table), then update the server.
2. **Update the server** (re-run the worker installer and answer `Y` to keep your settings):

   ```
   curl -fsSL https://raw.githubusercontent.com/paymentrlj-bit/openreply/main/deploy/oracle/setup-worker.sh -o setup-worker.sh
   sudo bash setup-worker.sh
   ```

3. **Get an AI key.** Free option: sign in at aistudio.google.com, choose *Get API key*, create one. Free-tier use means Google may use what you send to improve its products, and people may review it. Only the comment or message text is sent, never names, ids or your Instagram token. Adding billing to the key turns that off.
4. **Run the setup script** and answer its questions:

   ```
   sudo bash /opt/openreply/deploy/oracle/setup-engagement.sh
   ```

   Choose **dry-run** when asked for the mode. Alerts and the summary use the same mail settings as sign-in emails.
5. **Turn off Instagram's own instant reply** (Meta Business Suite, Inbox, Automations). Otherwise people get two automatic messages.
6. **Watch for two or three days.** Each evening at 9 pm India time you get an email listing what it would have sent. Read the replies, especially the Marathi ones.
7. **Go live:** `sudo bash /opt/openreply/deploy/oracle/setup-engagement.sh mode live`

To stop at any time: `sudo bash /opt/openreply/deploy/oracle/setup-engagement.sh mode off`

## Settings

These live in `/etc/openreply-worker.env` on the worker. The setup script writes them. Restart the worker after editing by hand.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ENGAGE_MODE` | `off` | `off`, `dry-run` or `live` |
| `ENGAGE_LLM_PROVIDER` | `gemini` | `gemini`, or `openai` for OpenRouter and compatible services |
| `ENGAGE_LLM_API_KEY` | | The service's key |
| `ENGAGE_LLM_MODEL` | `gemini-flash-latest` | Model name (required for `openai`) |
| `ENGAGE_LLM_BASE_URL` | `https://openrouter.ai/api/v1` | Only for `openai` |
| `ENGAGE_ALERT_EMAIL` | | Where alerts and the daily summary go |
| `EMAIL_SERVER`, `EMAIL_FROM` | | Mail settings, the same as in Vercel |
| `ENGAGE_MAX_PER_HOUR` / `ENGAGE_MAX_PER_DAY` | `20` / `120` | Reply limits |
| `ENGAGE_MIN_DELAY_SECONDS` / `ENGAGE_MAX_DELAY_SECONDS` | `45` / `600` | Random delay range |
| `ENGAGE_MAX_AGE_HOURS` | `24` | Ignore anything older |
| `ENGAGE_MIN_CONFIDENCE` | `0.7` | Below this the engine does nothing |
| `ENGAGE_COMPLAINT_DM` | `true` | Send the private feedback message to complainers |
| `ENGAGE_DM_REACTIONS` | `true` | Thank people who send emoji or a short thanks |
| `ENGAGE_DIGEST_HOUR_IST` | `21` | Hour (India time) for the daily summary |
| `ENGAGE_EXTRA_RULES` | | Extra instructions for the model, up to 600 characters |

The wording of the fixed replies is in `lib/engage/templates.ts`, and the model's instructions are in `lib/engage/persona.ts`. Have a native speaker read the Marathi and Hindi templates once.

## Privacy

Smart replies send comment and message text to the AI service you choose. That service becomes a data processor: name it on your privacy page and in the Meta app's data-handling answers. To remove one person's data on request, delete their rows from `EngagementLog` as well as from the campaign logs.

## Checking what happened

Every decision is stored in the `EngagementLog` table: the text, the category and language, what it decided and what it sent. The daily summary reads from it.
