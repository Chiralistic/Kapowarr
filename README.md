<p align="center">
<div align="center">

# ⚠️ **WARNING: THIS IS A VIBECODE TEST PROJECT — DO NOT USE** ⚠️

This repository is a development/test fork created for experimental feature integration (Usenet/Prowlarr support). **It is not production-ready and may contain broken or incomplete code. Do not use in production.**

</div>

    <img src="./frontend/static/img/favicon.svg" alt="Kapowarr" style="margin: 20px 0; width: 15rem;">
</p>
<p align="center">
    <a href="https://hub.docker.com/r/mrcas/kapowarr"><img src="https://img.shields.io/docker/pulls/mrcas/kapowarr?color=blue"></a>
    <a href="https://github.com/Casvt/Kapowarr"><img src="https://img.shields.io/github/stars/Casvt/Kapowarr?style=flat&color=blue"></a>
    <a href="https://ko-fi.com/casvt"><img src="https://img.shields.io/badge/Donate-Ko--Fi-blue"></a>
    <a href="https://github.com/Casvt/Kapowarr/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Casvt/Kapowarr?color=blue"></a>
</p>

# Kapowarr

Kapowarr is a software to build and manage a comic book library, fitting in the *arr suite of software.

Kapowarr allows you to build a digital library of comics. You can add volumes, map them to a folder and start managing! Download, rename, move and convert issues of the volume (including TPBs, One Shots, Hard Covers, and more). The whole process is automated and can be customised in the settings.

Featured on [Noted](https://noted.lol/kapowarr/) and [Respectlytics](https://respectlytics.com/).

## Features

- Run a "Search Monitored" to download whole volumes with one click
- Or use "Manual Search" to decide yourself what to download
- Import your existing library right into Kapowarr
- Support for all major operating systems
- Download using DDL, Pixeldrain, Mega and many other services
- Downloaded files automatically get moved wherever you want and renamed in the format you desire
- Archive files can be extracted and their contents renamed after downloading or with a single click
- The recognisable UI from the *arr suite of software

## Installation, support and documentation

- For instructions on how to install Kapowarr, see the [installation documentation](https://casvt.github.io/Kapowarr/installation/installation/).
- For support, a [Discord server](https://discord.gg/5gWtW3ekgZ) and [subreddit](https://www.reddit.com/r/kapowarr/) are available, or [make an issue](https://github.com/Casvt/Kapowarr/issues).
- For the planning of features or their progress, check the [project board](https://github.com/users/Casvt/projects/5).
- For all documentation, see the [documentation hub](https://casvt.github.io/Kapowarr/).
- For donations, go to the [Ko-Fi page](https://ko-fi.com/casvt).

## Screenshots

![](https://github.com/user-attachments/assets/04656209-288e-4263-a2df-93e06758c443)
![](https://github.com/user-attachments/assets/3fa8177c-f016-4cbd-b73e-6b577840b08e)
![](https://github.com/user-attachments/assets/69d59c21-3983-4acc-8777-ae0c7b65fdff)
![](https://github.com/user-attachments/assets/6e26c4e9-3c75-4b2c-b853-9fe2b56c9617)

---

## Updating a Proxmox Kapowarr Installation to This Test Fork

This guide explains how to switch an existing Kapowarr LXC (installed via [Proxmox VE Helper Scripts](https://community-scripts.org/scripts/kapowarr)) to this Vibecode test fork.

### Prerequisites
- Proxmox LXC with Kapowarr installed via the community script
- SSH access to the LXC
- This fork pushed to your GitHub (`Chiralistic/Kapowarr`)

### Step-by-Step

#### 1. Stop the Kapowarr service
```bash
systemctl stop kapowarr
```

#### 2. Back up your database (always!)
```bash
cp -a /opt/kapowarr/db /opt/kapowarr/db.bak
```

#### 3. Clone your fork into the Kapowarr directory
```bash
# Remove the old upstream code (keep db and config)
cd /opt/kapowarr
rm -rf backend frontend requirements.txt main.py README.md pyproject.toml setup.cfg

# Clone your test fork (replace with your actual branch name if different)
git clone --depth 1 https://github.com/Chiralistic/Kapowarr.git .
```

#### 4. Install dependencies
```bash
# The community script uses uv (Python package manager)
uv pip install -r requirements.txt
```

#### 5. Run the database migration
The migration runs automatically on first start. You can also trigger it manually:
```bash
# The migration V45 creates the search_sources table for Prowlarr support
# It runs automatically when Kapowarr starts
```

#### 6. Start the service
```bash
systemctl start kapowarr
```

#### 7. Verify the update
- Open Kapowarr in your browser: `http://<LXC-IP>:5656`
- Check the settings — you should see **"Search Sources"** and **"Usenet Clients"** tabs
- Add your Prowlarr and SABnzbd credentials

### Rolling Back
If something breaks, restore the backup:
```bash
systemctl stop kapowarr
cp -a /opt/kapowarr/db.bak /opt/kapowarr/db
systemctl start kapowarr
```

### Updating to New Commits
```bash
systemctl stop kapowarr
cd /opt/kapowarr
git pull origin main
uv pip install -r requirements.txt
systemctl start kapowarr
```

### Notes
- The database migration is **forward-only** — once applied, it cannot be undone
- Your existing download clients, volumes, and settings are preserved
- The `search_sources` table is new and will be empty until you add Prowlarr credentials
- This fork is **not production-ready** — use at your own risk