# Run the OpenReply worker on an Oracle Cloud Always Free server

The worker is the always-on process that actually sends the DMs. The website
(on Vercel) only receives comments and queues them. If the worker is off,
nothing is sent.

This guide uses a **second, separate** free Oracle server so it cannot affect
anything else you run. Oracle's console labels change from time to time, so
treat the click paths below as a guide.

## 1. Create the server (Oracle console)

1. Sign in to Oracle Cloud, then open **Compute > Instances > Create instance**.
2. Name: `openreply-worker`.
3. Image: **Canonical Ubuntu 22.04**.
4. Shape: choose **VM.Standard.E2.1.Micro** (the one marked *Always Free eligible*).
5. Networking: use your existing network and a public subnet, and keep
   **Assign a public IPv4 address** on. The worker only makes outbound
   connections, so no extra ports need opening beyond SSH.
6. SSH keys: upload the same public key you use for your other instance.
7. Click **Create**, wait for the state to become **Running**, and note the
   **Public IP address**.

## 2. Log in and run the installer

From your computer, log in (replace the key path and IP):

```
ssh -i /path/to/your-private-key ubuntu@YOUR_PUBLIC_IP
```

Then run these two commands on the server:

```
curl -fsSL https://raw.githubusercontent.com/paymentrlj-bit/openreply/main/deploy/oracle/setup-worker.sh -o setup-worker.sh
sudo bash setup-worker.sh
```

The script asks for your settings one at a time. Secret values stay hidden as
you paste them. Values it asks for:

| Setting | Where to find it |
| --- | --- |
| `DATABASE_URL` | Neon dashboard, the same value as in Vercel |
| `REDIS_URL` | Redis Cloud, the same value as in Vercel |
| `ENCRYPTION_KEY` | **Exactly** the same value as in Vercel |
| `NEXTAUTH_URL` | Your Vercel address, for example `https://rljewels-openreply.vercel.app` |
| `NEXTAUTH_SECRET` | The same value as in Vercel |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `FACEBOOK_APP_SECRET` | Meta app dashboard |

It then installs everything and starts the worker as a service. This takes a
few minutes on a small server.

## 3. Check it works

Open `https://YOUR-SITE/api/health`. When the worker is running you should see
`"worker":{"healthy":true,...}`. Allow about a minute after the script finishes.

## Everyday commands (run on the server)

| What | Command |
| --- | --- |
| Is it running? | `systemctl status openreply-worker` |
| Recent log lines | `sudo journalctl -u openreply-worker -n 50 --no-pager` |
| Restart | `sudo systemctl restart openreply-worker` |
| Update to the latest code | `sudo bash setup-worker.sh` (answer **Y** to keep your settings) |
| Change a setting | `sudo nano /etc/openreply-worker.env`, then restart |

## Things to know

- Keep `ENCRYPTION_KEY` identical on Vercel and on this server. If they differ,
  every send fails.
- The settings file `/etc/openreply-worker.env` holds secrets. It is readable
  only by the administrator. Never paste its contents into chat or email.
- Oracle may reclaim Always Free servers it considers idle. Watch `/api/health`
  and check Oracle's current policy for your account type.
