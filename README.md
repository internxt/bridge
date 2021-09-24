Internxt Bridge
=======================================================================================================

Quick Start
-----------

Install MongoDB, Git, Wget and build-essential:

```
sudo apt install mongodb redis-server git wget build-essential
```

Install [NVM][nvmsite], Node.js and Yarn:

```
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
source ~/.profile
npm i -g yarn
nvm install 10
```

(Default source name is .profile, but nvm will write its envs on your available shell, .zshrc, .bashrc...)

Clone the repository, install dependencies:

```
git clone https://github.com/internxt/bridge
cd bridge
yarn --ignore-engines
```

> **Note:** Internxt Bridge cannot communicate with the network on it's own, but 
> instead must communicate with a running 
> [Internxt Complex](https://github.com/internxt/complex) instance.

This will use the configuration file located at `~/.inxt-bridge/config/develop.json`.

Terms
-----

This software is released for **testing purposes** only. We make no guarantees with
respect to its function. By using this software you agree that Internxt is not
liable for any damage to your system. You also agree not to upload illegal
content, content that infringes on other's IP, or information that would be
protected by HIPAA, FERPA, or any similar standard. Generally speaking, you
agree to test the software responsibly. We'd love to hear feedback too.

 [nvmsite]: <https://github.com/nvm-sh/nvm>
