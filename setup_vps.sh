#!/bin/bash
# setup_vps.sh
# Deployment script for Arduino CLI compiler server on Oracle Cloud VM.Standard.E2.1.Micro (Ubuntu 22.04)

set -e # exit immediately if any command fails

echo "===================================================="
echo " Starting setup on the Ubuntu VPS..."
echo "===================================================="

# 1. Update packages
echo "[1/7] Updating apt packages..."
sudo apt-get update -y
sudo apt-get install -y python3 python3-pip python3-venv git curl unzip netfilter-persistent

# 2. Install Arduino CLI
echo "[2/7] Installing Arduino CLI..."
# Download and install arduino-cli binary to /usr/local/bin
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sudo BINDIR=/usr/local/bin sh
arduino-cli version

# 3. Configure Python Virtual Environment
echo "[3/7] Configuring Python virtual environment..."
cd /home/ubuntu/arduino-server
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

# 4. Open Port 5000 in Ubuntu's iptables Firewall
echo "[4/7] Configuring iptables OS firewall..."
# Check if rule for port 5000 already exists
if sudo iptables -L INPUT -n --line-numbers | grep -q "dpt:5000"; then
    echo "iptables rule for port 5000 already exists."
else
    echo "Inserting iptables ACCEPT rule for port 5000 at line 5 (above REJECT)..."
    sudo iptables -I INPUT 5 -p tcp --dport 5000 -m state --state NEW,ESTABLISHED -j ACCEPT
    sudo netfilter-persistent save
    echo "iptables firewall rules updated and saved."
fi

# 5. Set up Systemd Service for arduino-compiler
echo "[5/7] Registering systemd background service..."
sudo tee /etc/systemd/system/arduino-compiler.service > /dev/null << 'EOF'
[Unit]
Description=Arduino Compiler Server
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/arduino-server
ExecStart=/home/ubuntu/arduino-server/venv/bin/python prod_server.py
Restart=always
RestartSec=5
Environment=PATH=/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
EOF

# 6. Enable and Start service
echo "[6/7] Starting arduino-compiler service..."
sudo systemctl daemon-reload
sudo systemctl enable arduino-compiler.service
sudo systemctl restart arduino-compiler.service

# 7. Check service status
echo "[7/7] Verifying service state..."
sleep 2
sudo systemctl status arduino-compiler.service --no-pager || true

echo "===================================================="
echo " Setup complete! The compiler server is now running."
echo "===================================================="
