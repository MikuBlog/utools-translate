const axios = require('axios');
const md5 = require('md5');
const { execSync } = require('child_process');

let appkey = null;
let appsecret = null;

// 错误验证
const messages = {
   101: "缺少必填的参数",
   102: "不支持的语言类型",
   103: "翻译文本过长",
   108: "应用ID无效",
   110: "无相关服务的有效实例",
   111: "开发者账号无效",
   112: "请求服务无效",
   113: "查询为空",
   202: "签名检验失败,检查 KEY 和 SECRET",
   401: "账户已经欠费",
   411: "访问频率受限",
};

// 获取翻译url
function getUrl(word) {
   const isChinese = detectChinese(word);
   const from = isChinese ? "zh-CHS" : "auto";
   const to = isChinese ? "en" : "zh-CHS";
   const salt = Math.floor(Math.random() * 10000).toString();
   const sign = md5(`${appkey}${word}${salt}${appsecret}`);
   const params = new URLSearchParams({
      q: word,
      from,
      to,
      appKey: appkey,
      salt,
      sign,
   });

   return "https://openapi.youdao.com/api?" + params.toString();
}

function detectChinese(word) {
   return /^[\u4e00-\u9fa5]+$/.test(word);
}

function handleOutput(searchWord, callbackSetList = () => { }) {
   callbackSetList([{
      title: '正在查询中，请稍后',
   }])
   const isChinese = detectChinese(searchWord);
   axios({
      url: getUrl(searchWord),
      method: 'get',
   }).then(res => {
      const { translation, basic, web, errorCode } = res.data;
      if (errorCode === '0') {
         const listenerWord = isChinese ? translation[0] : searchWord;
         const isWindows = utools.isWindows();
         const description = `-----回车听发音${isWindows ? '(window暂不支持)' : ''}-----`;
         const list = translation.map(val => ({
            title: val,
            description: searchWord,
            icon: './logo.png',
         }))
         if (basic && basic["us-phonetic"]) {
            list.push({
               title: `[美：${basic["us-phonetic"]}] [英：${basic["uk-phonetic"]}]`,
               description,
               icon: './logo.png',
               listenerWord,
               listener: !isWindows,
            });
         } else if (basic && basic["phonetic"]) {
            list.push({
               title: listenerWord,
               description,
               icon: './logo.png',
               listenerWord,
               listener: !isWindows,
            });
         } else {
            list.push({
               title: listenerWord,
               description,
               icon: './logo.png',
               listenerWord,
               listener: !isWindows,
            });
         }
         basic && list.push(...basic.explains.map(val => ({
            title: val,
            description: searchWord,
            icon: './logo.png',
         })));
         web && list.push(...web.map(val => ({
            title: val.value.join('，'),
            description: val.key,
            icon: './logo.png',
         })));
         callbackSetList(list)
      } else if (errorCode === '108') {
         callbackSetList([{
            title: messages[errorCode],
            description: '请重新配置appkey与appsecret',
            icon: './logo.png',
            redirect: '懒人翻译小助手配置',
         }]);
      } else {
         callbackSetList([{
            title: messages[errorCode],
         }]);
      }
   }).catch(err => {
      callbackSetList([{
         title: err.toString(),
         description: '回车前往百度搜索',
         url: `https://www.baidu.com/s?wd=${searchWord}`,
      }])
   })
}

function handleSelect(itemData) {
   const { title, listenerWord, listener, url, redirect } = itemData;
   window.utools.hideMainWindow();
   if (listener) {
      execSync(`/bin/bash
      cd $TMPDIR
      query="${listenerWord}"
      voice="youdao-\${query}.mp3"
      
      echo say: "$voice" >&2
      
      if [[ ! -e \${voice} ]]; then
        curl -SL#o "$voice" -# -d "audio=\${query}" -d "type=1" "https://dict.youdao.com/dictvoice"
      fi
      
      afplay "$voice"`);
   } else if (url) {
      window.utools.hideMainWindow()
      require('electron').shell.openExternal(url)
      // 保证网页正常跳转再关闭插件
      setTimeout(() => {
         window.utools.outPlugin()
      }, 500);
   } else if (redirect) {
      return utools.redirect('懒人翻译小助手配置');
   } else {
      utools.copyText(title);
   }
   window.utools.outPlugin();
}

function initAppConfig() {
   const record = utools.db.get('yd');
   if (record) {
      appkey = record.data.appkey;
      appsecret = record.data.appsecret;
      return true;
   } else {
      utools.showNotification('请先配置appkey和appsecrect');
      setTimeout(() => {
         utools.redirect('懒人翻译小助手配置');
      }, 100);
      return false;
   }
}

window.exports = {
   "utools-translate": {
      mode: "list",
      args: {
         enter: () => {
            initAppConfig();
         },
         search: async (action, searchWord, callbackSetList) => {
            handleOutput(searchWord, callbackSetList);
         },
         // 用户选择列表中某个条目时被调用
         select: (action, itemData) => {
            handleSelect(itemData);
         },
         placeholder: '请输入要翻译的内容',
      },
   },
   "utools-translate-super": {
      mode: "list",
      args: {
         enter: (action, callbackSetList) => {
            if (initAppConfig()) {
               // 设置初始值
               setTimeout(() => {
                  utools.setSubInputValue(action.payload);
               });
               handleOutput(action.payload, callbackSetList);
            }
         },
         search: async (action, searchWord, callbackSetList) => {
            handleOutput(searchWord, callbackSetList);
         },
         // 用户选择列表中某个条目时被调用
         select: (action, itemData) => {
            handleSelect(itemData);
         },
         placeholder: '请输入要翻译的内容',
      },
   },
   "utools-config": {
      mode: 'list',
      args: {
         enter: () => {
            const ubWindow = utools.createBrowserWindow('config.html', {
               show: false,
               width: 600,
               height: 480,
               title: '配置窗口',
               webPreferences: {
                  preload: 'preload.js'
               }
            }, () => {
               // 显示
               ubWindow.show()
               // 置顶
               ubWindow.setAlwaysOnTop(true);
            });
         },
      },
   }
}