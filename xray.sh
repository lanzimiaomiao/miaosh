#!/bin/sh

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

CONF_PATH="/etc/xray/config.json"
XRAY_BIN="/usr/local/bin/xray"
LOG_PATH="/var/log/xray.log"
CERT_FILE="/etc/xray/server.crt"
KEY_FILE="/etc/xray/server.key"

# 获取架构
ARCH=$(uname -m)
case ${ARCH} in
    x86_64)  X_ARCH="64" ;;
    aarch64) X_ARCH="arm64-v8a" ;;
    *) echo "不支持的架构"; exit 1 ;;
esac

# 1. 清理函数
do_cleanup() {
    echo -e "${BLUE}正在清理旧环境...${NC}"
    [ -f /etc/init.d/xray ] && rc-service xray stop 2>/dev/null && rc-update del xray default 2>/dev/null
    rm -rf /etc/xray /usr/local/share/xray ${XRAY_BIN} ${LOG_PATH} /etc/init.d/xray
}

# 2. 安装依赖并下载
download_xray() {
    echo -e "${BLUE}安装依赖 (含 libc6-compat 兼容库)...${NC}"
    apk update && apk add curl unzip openssl ca-certificates uuidgen tar gcompat libc6-compat > /dev/null 2>&1

    echo -e "${BLUE}获取最新版本...${NC}"
# 尝试从官方 release 页面抓取
NEW_VER=$(curl -s https://github.com/XTLS/Xray-core/releases/latest | grep -oP 'v[0-9]+\.[0-9]+\.[0-9]+' | head -n 1)

# 如果抓取失败，至少给一个 2026 年的版本作为兜底
[ -z "$NEW_VER" ] && NEW_VER="v26.3.27"
    
    echo -e "${GREEN}下载版本: ${NEW_VER}${NC}"
    curl -L -o /tmp/xray.zip "https://github.com/XTLS/Xray-core/releases/download/${NEW_VER}/Xray-linux-${X_ARCH}.zip"
    
    mkdir -p /etc/xray /usr/local/share/xray /tmp/xray_tmp
    unzip -o /tmp/xray.zip -d /tmp/xray_tmp
    mv -f /tmp/xray_tmp/xray ${XRAY_BIN}
    mv -f /tmp/xray_tmp/*.dat /usr/local/share/xray/
    chmod +x ${XRAY_BIN}
    rm -rf /tmp/xray.zip /tmp/xray_tmp
}

# 3. 更新功能
do_update() {
    if [ ! -f "${XRAY_BIN}" ]; then echo -e "${RED}未安装 Xray${NC}"; exit 1; fi
    echo -e "${BLUE}保留配置更新二进制文件...${NC}"
    rc-service xray stop
    download_xray
    rc-service xray start
    echo -e "${GREEN}更新成功！${NC}"
    exit 0
}

# 指令处理
if [ "$1" = "uninstall" ]; then do_cleanup; echo -e "${GREEN}卸载完成${NC}"; exit 0; fi
if [ "$1" = "update" ]; then do_update; fi

# 默认安装流程
do_cleanup
download_xray

# 4. 密钥生成 (增强兼容性修复版)
echo -e "${BLUE}生成 Reality 密钥对...${NC}"
X_KEYS_ALL=$(${XRAY_BIN} x25519 2>/dev/null)
UUID=$(${XRAY_BIN} uuid 2>/dev/null)

# 使用更宽泛的正则匹配：匹配 Key 后面的内容（忽略大小写，兼容冒号或空格）
PRIVATE_KEY=$(echo "${X_KEYS_ALL}" | grep -i "Private" | awk '{print $NF}' | tr -d '\r\n ')
PUBLIC_KEY=$(echo "${X_KEYS_ALL}" | grep -i "Public" | awk '{print $NF}' | tr -d '\r\n ')

SHORT_ID=$(openssl rand -hex 4)
DEST_DOMAIN="speed.cloudflare.com"

# 检查变量是否真的拿到了值
if [ -z "$PRIVATE_KEY" ] || [ -z "$PUBLIC_KEY" ]; then
    echo -e "${RED}密钥提取仍然失败！调试信息：${NC}"
    echo "原始输出: ${X_KEYS_ALL}"
    exit 1
fi

SHORT_ID=$(openssl rand -hex 4)
DEST_DOMAIN="speed.cloudflare.com"

# 生成自签名证书
openssl req -x509 -nodes -newkey rsa:2048 -keyout ${KEY_FILE} -out ${CERT_FILE} -days 3650 -subj "/CN=${DEST_DOMAIN}" > /dev/null 2>&1

# 使用指定方式提取 SHA256 Fingerprint 并进行 URL 编码替换 (冒号转 %3A)
CERT_PIN=$(openssl x509 -noout -fingerprint -sha256 -in ${CERT_FILE} | cut -d'=' -f2)

if [ -z "$PRIVATE_KEY" ] || [ -z "$PUBLIC_KEY" ]; then
    echo -e "${RED}密钥提取失败！Xray 输出内容如下：${NC}"
    echo "${X_KEYS_ALL}"
    exit 1
fi

# 5. 写入防刷流量配置
cat << CONF > ${CONF_PATH}
{
    "log": { "access": "${LOG_PATH}", "loglevel": "info" },
    "inbounds": [
        {
            "tag": "dokodemo-in",
            "port": 4431,
            "protocol": "dokodemo-door",
            "settings": { "address": "${DEST_DOMAIN}", "port": 443, "network": "tcp" },
            "sniffing": { "enabled": true, "destOverride": ["tls"], "routeOnly": true }
        },
        {
            "listen": "0.0.0.0",
            "port": 443,
            "protocol": "vless",
            "settings": {
                "clients": [{ "id": "${UUID}", "flow": "xtls-rprx-vision" }],
                "decryption": "none"
            },
            "streamSettings": {
                "network": "tcp",
                "security": "reality",
                "realitySettings": {
                    "dest": "127.0.0.1:4431",
                    "serverNames": ["${DEST_DOMAIN}"],
                    "privateKey": "${PRIVATE_KEY}",
                    "shortIds": ["${SHORT_ID}"],
                    "fingerprint": "random"
                }
            },
            
            "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"], "routeOnly": true }
        },
        {
            "listen": "0.0.0.0",
            "port": 443,
            "protocol": "hysteria",
            "settings": {
                "version": 2,
                "clients": [{ "auth": "${UUID}" }]
            },
            "streamSettings": {
                "network": "hysteria",
                "hysteriaSettings": { "version": 2 },
                "security": "tls",
                "tlsSettings": {
                    "alpn": ["h3"],
                    "certificates": [{
                        "certificateFile": "${CERT_FILE}",
                        "keyFile": "${KEY_FILE}"
                    }]
                }
            }
        }
    ],
    "outbounds": [
        { "protocol": "freedom", "settings": { "domainStrategy": "UseIP" }, "tag": "direct" },
        { "protocol": "blackhole", "tag": "block" }
    ],
    "routing": {
        "rules": [
            {
                "type": "field",
                "inboundTag": ["dokodemo-in"],
                "domain": ["${DEST_DOMAIN}"],
                "outboundTag": "direct"
            },
            {
                "type": "field",
                "inboundTag": ["dokodemo-in"],
                "outboundTag": "block"
            }
        ]
    }
}
CONF

# 6. 服务配置
cat << 'SERVICE' > /etc/init.d/xray
#!/sbin/openrc-run
description="Xray Reality"
command="/usr/local/bin/xray"
command_args="run -c /etc/xray/config.json"
command_background="yes"
pidfile="/run/${RC_SVCNAME}.pid"
depend() { need net; after firewall; }
SERVICE
chmod +x /etc/init.d/xray
rc-update add xray default
rc-service xray restart

# 7. 分离双栈输出
sleep 2
PID=$(pidof xray)
IP4=$(curl -s4 ifconfig.me)
IP6=$(curl -s6 ifconfig.me)

echo ""
echo -e "${GREEN}================ 安装完成 (Reality 防刷版) ===================${NC}"
[ -n "$PID" ] && echo -e "运行状态: ${GREEN}运行中 (PID: $PID)${NC}" || echo -e "运行状态: ${RED}启动失败${NC}"
echo -e "配置文件: ${BLUE}${CONF_PATH}${NC}"
echo "------------------------------------------------"

# IPv4 节点
if [ -n "$IP4" ]; then
    echo -e "${BLUE}[IPv4 reality节点信息]${NC}"
    echo -e "v2RayN: vless://${UUID}@${IP4}:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${DEST_DOMAIN}&fp=random&pbk=${PUBLIC_KEY}&sid=${SHORT_ID}&type=tcp&headerType=none#Reality_V4"ame: Reality_V4, type: vless, server: ${IP4}, port: 443, uuid: ${UUID}, udp: true, tls: true, flow: xtls-rprx-vision, servername: ${DEST_DOMAIN}, network: tcp, reality-opts: {public-key: ${PUBLIC_KEY}, short-id: ${SHORT_ID}}, client-fingerprint: random}"
    echo -e "Clash: - {name: Reality_V4, type: vless, server: '${IP4}', port: 443, uuid: ${UUID}, udp: true, tls: true, flow: xtls-rprx-vision, servername: ${DEST_DOMAIN}, network: tcp, reality-opts: {public-key: ${PUBLIC_KEY}, short-id: ${SHORT_ID}}, client-fingerprint: random}"
    echo -e "${BLUE}[IPv4 Hysteria2节点信息]${NC}"
    echo "hysteria2://${UUID}@${IP4}:443?sni=${DEST_DOMAIN}&insecure=0&allowInsecure=0&pinSHA256=${CERT_PIN}#Hysteria_V4"
    echo -e "Clash: - {name: "Hysteria_V4", type: hysteria2, server: ${IP4}, port: 443, password: ${UUID}, up: "100 Mbps", down: "200 Mbps", sni: ${DEST_DOMAIN}, skip-cert-verify: false, fingerprint: "${CERT_PIN}", alpn: [h3]}"
    echo ""
fi

# IPv6 节点
if [ -n "$IP6" ]; then
    echo -e "${BLUE}[IPv6 reality节点信息]${NC}"
    echo -e "v2RayN: vless://${UUID}@[${IP6}]:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${DEST_DOMAIN}&fp=random&pbk=${PUBLIC_KEY}&sid=${SHORT_ID}&type=tcp&headerType=none#Reality_V6"
    echo -e "Clash: - {name: Reality_V6, type: vless, server: '${IP6}', port: 443, uuid: ${UUID}, udp: true, tls: true, flow: xtls-rprx-vision, servername: ${DEST_DOMAIN}, network: tcp, reality-opts: {public-key: ${PUBLIC_KEY}, short-id: ${SHORT_ID}}, client-fingerprint: random}"
    echo -e "${BLUE}[IPv6 Hysteria2节点信息]${NC}"
    echo "hysteria2://${UUID}@[${IP6}]:443?sni=${DEST_DOMAIN}&insecure=0&allowInsecure=0&pinSHA256=${CERT_PIN}#Hysteria_V6"
    echo -e "Clash: - {name: "Hysteria_V6", type: hysteria2, server: ${IP4}, port: 443, password: ${UUID}, up: "100 Mbps", down: "200 Mbps", sni: ${DEST_DOMAIN}, skip-cert-verify: false, fingerprint: "${CERT_PIN}", alpn: [h3]}"
    echo ""
fi

echo "------------------------------------------------"
echo -e "${GREEN}[管理维护指令]${NC}"
echo -e "1. 实时日志 (查偷流): ${BLUE}tail -f ${LOG_PATH}${NC}"
echo -e "2. 仅更新内核: ${BLUE}sh $0 update${NC}"
echo -e "3. 覆盖安装(刷新密钥): ${BLUE}sh $0${NC}"
echo -e "4. 卸载服务: ${BLUE}sh $0 uninstall${NC}"
echo -e "${GREEN}=============================================================${NC}"
