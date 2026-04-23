import { connect } from 'cloudflare:sockets';
//说明：抛弃了ed配置，不要设置/?ed=2560，自适应ws和xhttp双传输协议，xhttp不适合pages部署，ws建议pages部署，不受影响，理论上也支持Snippets部署
let 哎呀呀这是我的VL密钥 = "aa15a15c-cbcc-4dd6-cb51-5a70cc0a62a8";

let 启用反代功能 = true //选择是否启用反代功能【总开关】，false，true，现在你可以自由的选择是否启用反代功能了
let 反代IP = 'ProxyIP.JP.CMLiussss.net' //反代IP或域名，反代IP端口一般情况下不用填写，如果你非要用非标反代的话，可以填'ts.hpc.tw:443'这样

let 启用SOCKS5反代 = false //如果启用此功能，原始反代将失效，很多S5不一定支持ipv6，启用则需禁用doh查询ipv6功能
let 启用SOCKS5全局反代 = false //选择是否启用SOCKS5全局反代，启用后所有访问都是S5的落地【无论你客户端选什么节点】，访问路径是客户端--CF--SOCKS5，当然启用此功能后延迟=CF+SOCKS5，带宽取决于SOCKS5的带宽，不再享受CF高速和随时满带宽的待遇
let 我的SOCKS5账号 = [
  '@Enkelte_notif:@Notif_Chat@115.91.26.114:2470',
] //格式'账号:密码@地址:端口'，示例admin:admin@127.0.0.1:443或admin:admin@[IPV6]:443，支持无账号密码示例@127.0.0.1:443

let 启用新版传输模式 = true //开启true则使用天书独有的队列传输方式，关闭false则是原始管道流传输方式【如果你是付费用户，追求带宽，用管道流，如果你是免费用户，追求稳定丝滑，用队列传输，XHTTP无所谓了，包断的，不想断花钱去:p】
//////////////////////////////////////////////////////////////////////////主要架构////////////////////////////////////////////////////////////////////////
export default {
  async fetch(访问请求) {
    const 读取路径 = decodeURIComponent(访问请求.url.replace(/^https?:\/\/[^/]+/, ''));
    反代IP = 读取路径.match(/proxyip=([^&]+)/)?.[1] || 反代IP;
    const SOCKS5新账号 = 读取路径.match(/socks5=([^&]+)/)?.[1];
    我的SOCKS5账号 = [...(SOCKS5新账号 ? [SOCKS5新账号] : []), ...我的SOCKS5账号];
    启用SOCKS5反代 = 读取路径.match(/socks5-open=([^&]+)/)?.[1] === 'true' || 启用SOCKS5反代;
    启用SOCKS5全局反代 = 读取路径.match(/socks5-global=([^&]+)/)?.[1] === 'true' || 启用SOCKS5全局反代;
    if (访问请求.headers.get('Upgrade') === 'websocket'){
      const [客户端, WS接口] = Object.values(new WebSocketPair());
      WS接口.accept();
      处理数据(WS接口, true);
      return new Response(null, { status: 101, webSocket: 客户端 }); //一切准备就绪后，回复客户端WS连接升级成功
    } else if (访问请求.method === 'POST' && 访问请求.body) {
      return await 处理数据(访问请求, false);
    } else {
      return new Response('Hello World!', { status: 200 });
    }
  }
};
async function 处理数据(数据接口, 传输协议, 处理首包数据 = Promise.resolve(), 传输队列 = Promise.resolve()) {
  if (传输协议) {
    处理WS流(数据接口);
  } else {
    return await 处理XHTTP流(数据接口);
  }
  async function 处理WS流(WS接口, 是首包 = true, 解析首包, 传输数据) {
    WS接口.addEventListener('message', async event => {
      try {
        if (是首包) {
          是首包 = false;
          处理首包数据 = 处理首包数据.then(async () => await 处理首包(event.data)).catch(e => {throw (e)});
        } else {
          await 处理首包数据;
          if (启用新版传输模式) {
            传输队列 = 传输队列.then(() => 传输数据.write(event.data)).catch(e => {throw (e)});
          } else {
            传输数据.write(event.data);
          }
        }
      } catch {};
    });
    async function 处理首包 (首包数据) {
      解析首包 = await 解析首包数据(new Uint8Array(首包数据));
      传输数据 = 解析首包.TCP接口.writable.getWriter();
      await 传输数据.write(解析首包.初始数据);
      数据回传通道(解析首包.TCP接口, 解析首包.版本号).pipeTo(new WritableStream({ write(数据) { WS接口.send(数据) } }));
    }
  }
  async function 处理XHTTP流(访问请求) {
    try {
      const 读取器 = 访问请求.body.getReader();
      const 请求数据 = (await 读取器.read()).value;
      const 解析首包 = await 解析首包数据(new Uint8Array(请求数据));
      const 传输数据 = 解析首包.TCP接口.writable.getWriter();
      await 传输数据.write(解析首包.初始数据);
      if (启用新版传输模式) {
        数据发送通道(读取器, 传输数据);
      } else {
        读取器.releaseLock();
        传输数据.releaseLock();
        访问请求.body.pipeTo(解析首包.TCP接口.writable);
      }
      return new Response(数据回传通道(解析首包.TCP接口, 解析首包.版本号));
    } catch (e) {
      return new Response(`拒绝访问：${e}`, { status: 400 });
    }
  }
  async function 数据发送通道(读取器, 传输数据) {
    while (true) {
      const { done: 流结束, value: 请求数据 } = await 读取器.read();
      if (流结束) break;
      if(请求数据.length > 0) 传输队列 = 传输队列.then(() => 传输数据.write(请求数据)).catch(e => {throw (e)});
    }
  }
  function 数据回传通道 (TCP接口, 版本号) {
    const 读取管道 = new TransformStream({
      async start(控制器) { 
        控制器.enqueue(new Uint8Array([版本号, 0]));
        if (启用新版传输模式) {
          const 读取数据 = TCP接口.readable.getReader();
          while (true) {
            const { done: 流结束, value: 返回数据 } = await 读取数据.read();
            if (流结束) break;
            if (返回数据 && 返回数据.length > 0) 传输队列 = 传输队列.then(() => 控制器.enqueue(返回数据)).catch(e => {throw (e)});
          }
        }
      },
      transform(返回数据, 控制器) { 控制器.enqueue(返回数据) }
    });
    if (!启用新版传输模式) TCP接口.readable.pipeTo(读取管道.writable);
    return 读取管道.readable;
  }
}
async function 解析首包数据(二进制数据) {
  let 识别地址类型, 访问地址, 地址长度;
  if (二进制数据.length < 32) throw new Error('数据长度不足');
  const 获取协议头 = 二进制数据[0];
  const 验证VL的密钥 = (a, i = 0) => [...a.slice(i, i + 16)].map(b => b.toString(16).padStart(2, '0')).join('').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  if (验证VL的密钥(二进制数据.slice(1, 17)) !== 哎呀呀这是我的VL密钥) throw new Error('UUID验证失败');
  const 提取端口索引 = 18 + 二进制数据[17] + 1;
  const 访问端口 = new DataView(二进制数据.buffer, 提取端口索引, 2).getUint16(0);
  const 提取地址索引 = 提取端口索引 + 2;
  识别地址类型 = 二进制数据[提取地址索引];
  let 地址信息索引 = 提取地址索引 + 1;
  switch (识别地址类型) {
    case 1:
      地址长度 = 4;
      访问地址 = 二进制数据.slice(地址信息索引, 地址信息索引 + 地址长度).join('.');
      break;
    case 2:
      地址长度 = 二进制数据[地址信息索引];
      地址信息索引 += 1;
      访问地址 = new TextDecoder().decode(二进制数据.slice(地址信息索引, 地址信息索引 + 地址长度));
      break;
    case 3:
      地址长度 = 16;
      const ipv6 = [];
      const 读取IPV6地址 = new DataView(二进制数据.buffer, 地址信息索引, 16);
      for (let i = 0; i < 8; i++) ipv6.push(读取IPV6地址.getUint16(i * 2).toString(16));
      访问地址 = ipv6.join(':');
      break;
    default:
      throw new Error ('无效的访问地址');
  }
  const 写入初始数据 = 二进制数据.slice(地址信息索引 + 地址长度);
  const TCP接口 = await 创建TCP接口连接(访问地址, 访问端口, 识别地址类型);
  console.log(`访问地址: ${访问地址}:${访问端口}，地址类型: ${识别地址类型}`);
  return { 版本号: 获取协议头, TCP接口: TCP接口, 初始数据: 写入初始数据 };
}
async function 创建TCP接口连接(访问地址, 访问端口, 识别地址类型, TCP接口) {
  if (启用反代功能 && 启用SOCKS5反代 && 启用SOCKS5全局反代) {
    TCP接口 = await 创建SOCKS5接口(识别地址类型, 访问地址, 访问端口);
  } else {
    try {
      if (识别地址类型 === 3) {
        const 转换IPV6地址 = `[${访问地址}]`
        TCP接口 = connect({ hostname: 转换IPV6地址, port: 访问端口 });
      } else {
        TCP接口 = connect({ hostname: 访问地址, port: 访问端口 });
      }
      await TCP接口.opened;
    } catch {
      if (启用反代功能) {
        if (启用SOCKS5反代) {
          TCP接口 = await 创建SOCKS5接口(识别地址类型, 访问地址, 访问端口);
        } else {
          const 解析反代IP = 匹配地址(反代IP);
          TCP接口 = connect({ hostname: 解析反代IP.地址, port: 解析反代IP.端口});
        }
      }
    }
  }
  return TCP接口;
}
//////////////////////////////////////////////////////////////////////////SOCKS5部分//////////////////////////////////////////////////////////////////////
async function 创建SOCKS5接口(识别地址类型, 访问地址, 访问端口, 转换访问地址, 传输数据, 读取数据) {
  let SOCKS5接口, 账号, 密码, 地址, 端口;
  let 索引SOCKS5账号 = 0;
  我的SOCKS5账号 = Array.isArray(我的SOCKS5账号) ? 我的SOCKS5账号 : [我的SOCKS5账号];
  while (索引SOCKS5账号 < 我的SOCKS5账号.length) {
    const 提取SOCKS5账号 = 我的SOCKS5账号[索引SOCKS5账号]
    try {
      ({ 账号, 密码, 地址, 端口 } = await 获取SOCKS5账号(提取SOCKS5账号));
      SOCKS5接口 = connect({ hostname: 地址, port: 端口 });
      await SOCKS5接口.opened;
      传输数据 = SOCKS5接口.writable.getWriter();
      读取数据 = SOCKS5接口.readable.getReader();
      const 转换数组 = new TextEncoder(); //把文本内容转换为字节数组，如账号，密码，域名，方便与S5建立连接
      const 构建S5认证 = new Uint8Array([5, 2, 0, 2]); //构建认证信息,支持无认证和用户名/密码认证
      await 传输数据.write(构建S5认证); //发送认证信息，确认目标是否需要用户名密码认证
      const 读取认证要求 = (await 读取数据.read()).value;
      if (读取认证要求[1] === 0x02) { //检查是否需要用户名/密码认证
        if (!账号 || !密码) {
          throw new Error (`未配置账号密码`);
        }
        const 构建账号密码包 = new Uint8Array([ 1, 账号.length, ...转换数组.encode(账号), 密码.length, ...转换数组.encode(密码) ]); //构建账号密码数据包，把字符转换为字节数组
        await 传输数据.write(构建账号密码包); //发送账号密码认证信息
        const 读取账号密码认证结果 = (await 读取数据.read()).value;
        if (读取账号密码认证结果[0] !== 0x01 || 读取账号密码认证结果[1] !== 0x00) { //检查账号密码认证结果，认证失败则退出
          throw new Error (`账号密码错误`);
        }
      }
      switch (识别地址类型) {
        case 1: // IPv4
          转换访问地址 = new Uint8Array( [1, ...访问地址.split('.').map(Number)] );
          break;
        case 2: // 域名
          转换访问地址 = new Uint8Array( [3, 访问地址.length, ...转换数组.encode(访问地址)] );
          break;
        case 3: // IPv6
          转换访问地址 = 转换为Socks5IPv6地址(访问地址);
          function 转换为Socks5IPv6地址(原始地址) {
            const [前缀部分 = "", 后缀部分 = ""] = 原始地址.split("::");
            const 前缀 = 前缀部分.split(":").filter(Boolean);
            const 后缀 = 后缀部分.split(":").filter(Boolean);
            const 填充数量 = 8 - (前缀.length + 后缀.length);
            const 完整分段 = [
              ...前缀,
              ...Array(填充数量).fill("0"),
              ...后缀
            ];
            const IPv6字节 = 完整分段.flatMap(字段 => {
              const 数值 = parseInt(字段 || "0", 16);
              return [(数值 >> 8) & 0xff, 数值 & 0xff];
            });
            return new Uint8Array([ 4, ...IPv6字节 ]);
          }
          break;
      }
      const 构建转换后的访问地址 = new Uint8Array([ 5, 1, 0, ...转换访问地址, 访问端口 >> 8, 访问端口 & 0xff ]); //构建转换好的地址消息
      await 传输数据.write(构建转换后的访问地址); //发送转换后的地址
      const 检查返回响应 = (await 读取数据.read()).value;
      if (检查返回响应[0] !== 0x05 || 检查返回响应[1] !== 0x00) {
        throw new Error (`目标地址连接失败，访问地址: ${访问地址}，地址类型: ${识别地址类型}`);
      }
      传输数据.releaseLock();
      读取数据.releaseLock();
      return SOCKS5接口;
    } catch {
      索引SOCKS5账号++
    };
  }
  传输数据?.releaseLock();
  读取数据?.releaseLock();
  await SOCKS5接口?.close();
  throw new Error (`所有SOCKS5账号失效`);
}
async function 获取SOCKS5账号(SOCKS5) {
  const 分隔账号 = SOCKS5.includes("@") ? SOCKS5.lastIndexOf("@") : -1;
  const 账号段 = SOCKS5.slice(0, 分隔账号);
  const 地址段 = 分隔账号 !== -1 ? SOCKS5.slice(分隔账号 + 1) : SOCKS5;
  const [账号, 密码] = [账号段.slice(0, 账号段.lastIndexOf(":")), 账号段.slice(账号段.lastIndexOf(":") + 1)];
  const 解析SOCKS5地址 = 匹配地址(地址段);
  return { 账号, 密码, 地址: 解析SOCKS5地址.地址 , 端口: 解析SOCKS5地址.端口 };
}
function 匹配地址(地址) {
  const 匹配 = 地址.match(/^(?:\[(?<ipv6>[0-9a-fA-F:]+)\]|(?<ipv6>[0-9a-fA-F:]+)|(?<ipv4>\d{1,3}(?:\.\d{1,3}){3})|(?<domain>[a-zA-Z0-9.-]+))(?::(?<port>\d+))?$/);
  const { ipv6, ipv4, domain, port } = 匹配.groups;
  return {
    类型: ipv6 ? 'ipv6' : ipv4 ? 'ipv4' : '域名',
    地址: ipv6 || ipv4 || domain,
    端口: port ? Number(port) : 443
  };
}
