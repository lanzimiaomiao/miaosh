这是一个alpine 安装reality+hy2一键脚本
该脚本是找gemini ai搓的
安装的文件都是从官方仓库获取
```
apk  update
apk add curl bash wget
```

```
wget https://github.com/lanzimiaomiao-prog/miaosh/raw/main/xray.sh
bash xray.sh
```



**调整tcp窗口大小**
```
bash <(curl -L -s https://github.com/lanzimiaomiao-prog/miaosh/raw/main/tcp_alpine.sh)
```
