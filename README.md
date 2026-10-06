# Our Honey Pot

A community blog platform powered by Hive blockchain. Run a blog for your Hive community - all content is stored on the blockchain, no traditional database needed.

## What is this?

Our Honey Pot is a community blog platform that uses Hive blockchain to store and retrieve all content. Instead of saving posts in a traditional database, everything is fetched directly from the blockchain. This makes your community blog:

- Decentralized - your content lives on the blockchain
- Censorship-resistant - no central authority controls your data
- Transparent - all changes are publicly recorded
- Database-free - no need to manage servers or databases
- Multi-author - community members can create and publish posts

## Features

- All posts fetched directly from Hive blockchain
- Community profile and sidebar with community info
- Multi-author support - any community member can post
- Post editor with CodeMirror (Markdown support, syntax highlighting)
- Customizable design through admin panel
- No database setup required
- Secure authentication with Hive keys (Keychain, HB Auth, WIF)
- Responsive design with dark mode
- Role-based access control (admin/moderator/member)

## Requirements

### For all deployments:

- A Hive community account (format: `hive-XXXXXX`) - create one at [hive.io](https://hive.io) or [ecency.com](https://ecency.com)
- Your Hive community name - the blog will display posts from this community

### Additional for VPS/Docker deployments:

- A VPS (Virtual Private Server) with Docker installed
- Traefik reverse proxy running with `common_proxy_network` network configured
- A domain name pointed to your VPS

## Configuration (runtime environment)

One build (one Docker image) can serve many blogs: every setting below is read from the environment when the server starts, not baked into the build. Changing a value only needs a restart of the container (or a redeploy on Vercel), never a rebuild.

Required per blog:

| Variable          | Description                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `HIVE_USERNAME`   | Blog owner: a Hive account or a community (`hive-XXXXXX`). Validated at startup; an invalid name stops the server with an error. |
| `PUBLIC_SITE_URL` | Public origin of the blog, e.g. `https://yourdomain.com` (canonical links, SEO).                                                 |

Optional, with defaults:

| Variable                      | Default                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| `PUBLIC_HIVE_API_ENDPOINT`    | `https://api.openhive.network` (with mainnet fallbacks)                 |
| `PUBLIC_HIVE_CHAIN_ID`        | Hive mainnet chain ID; any other value enables testnet mode (WIF login) |
| `PUBLIC_HIVE_IMAGES_ENDPOINT` | `https://images.hive.blog`                                              |
| `PUBLIC_BEEYARD_URL`          | `https://beeyard.bard-dev.com`                                          |
| `PUBLIC_HIVE_BLOG_URL`        | same as `PUBLIC_BEEYARD_URL`                                            |
| `PUBLIC_HIVE_SIGNER_URL`      | `https://signer.bard-dev.com`                                           |

The server passes the public values to the browser with each page, so the client always uses the same settings as the running container.

Blog settings saved in the admin panel are stored on the blockchain under a fixed permlink on the blog owner's account, so no extra variable is needed for them.

See `.env.example` for a template.

## Quick Deployment on Vercel (Recommended)

Vercel is the easiest way to deploy this blog. It's free for personal projects.

### Step 1: Prepare the code

1. Create a GitHub account if you don't have one
2. Fork or clone this repository to your GitHub account

### Step 2: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up with your GitHub account
2. Click "New Project"
3. Import your forked repository
4. Add environment variables:
   - `HIVE_USERNAME` = your Hive community (`hive-XXXXXX`) or account name
   - `PUBLIC_SITE_URL` = leave empty for first deploy, you will add your Vercel URL after deployment
5. Click "Deploy"

### Step 3: Configure site URL

After deployment completes:

1. Copy your Vercel URL (e.g., `your-project.vercel.app`)
2. Go to Project Settings > Environment Variables
3. Update `PUBLIC_SITE_URL` to `https://your-project.vercel.app`
4. Redeploy (Deployments tab > three dots > Redeploy)

### Step 4: Done

Your community blog is now live. Vercel will give you a URL like `your-project.vercel.app`.

You can add a custom domain later in Vercel dashboard settings.

## Advanced Deployment on VPS (Docker)

If you have your own server and want full control, you can deploy with Docker.

**IMPORTANT**: This project REQUIRES Traefik reverse proxy with `common_proxy_network` external network. The container will not start without it.

### Steps

1. Connect to your VPS via SSH

2. Clone this repository:

```bash
git clone https://github.com/KKocot/our-honey-pot.git
cd our-honey-pot
```

3. Create a `.env` file with your settings (Docker Compose passes them to the container at runtime, see [Configuration](#configuration-runtime-environment)):

```bash
HIVE_USERNAME=hive-123456
DOMAIN=yourdomain.com
PUBLIC_SITE_URL=https://yourdomain.com
```

4. Verify Traefik is running:

```bash
docker network ls | grep common_proxy_network
```

If the network doesn't exist, set up Traefik first before continuing.

5. Build and start the container:

```bash
docker compose up -d --build
```

6. Check if it's running:

```bash
docker logs -f our-honey-pot
```

Your community blog will be available at your domain via HTTPS through Traefik.

## Admin Panel

Access the admin panel at `yourdomain.com/admin` to customize your community blog.

### Login

1. Click "Login with Hive"
2. Choose your login method: Hive Keychain, HB Auth, or WIF (posting key)

**What is a posting key?** It's one of your Hive private keys that allows posting content and updating your blog settings.

**SECURITY WARNING**: NEVER use your master password, owner key, or active key. Only use your posting key. The key stays in your browser and is never sent to any server.

### Creating Posts

1. Log in with your Hive account
2. Navigate to the post editor
3. Write your post in Markdown using the CodeMirror editor
4. Publish directly to the blockchain

### Customization

You can customize: site title, description, layout style, colors, community profile visibility, comments, posts per page, and SEO settings.

### Saving changes

1. Make changes in the admin panel
2. Click "Save to Hive Blockchain"
3. Your settings are stored on the blockchain

**Note**: Saving costs Resource Credits (RC). New accounts may need to wait or get RC delegation. Learn more at [hive.io](https://hive.io).

## Questions?

For technical details and contribution guidelines, check the project repository.

## License

This project is licensed under the [GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0-or-later).

You are free to use, modify, and distribute this software. If you run a modified version on a network server, you must make the modified source code available to users.

---

Built with Hive blockchain technology - decentralized, transparent, and censorship-resistant.
