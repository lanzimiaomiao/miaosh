这是一个alpine一键脚本库
该脚本是找gemini ai搓的
安装的文件都是从官方仓库获取

确保你安装了curl

```
apk  update
apk add curl bash
```

```
wget https://github.com/lanzimiaomiao-prog/miaosh/raw/main/xray.sh
bash xray.sh
```



**调整tcp窗口大小**
```
bash <(curl -L -s https://github.com/lanzimiaomiao-prog/miaosh/raw/main/tcp_alpine.sh)
```
