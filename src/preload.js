const axios = require("axios");
const md5 = require("md5");
const { execSync } = require("child_process");

let appkey = null;
let appsecret = null;

const normalIcon = "./logo.png";
const pronounceIcon = "./assets/laba.png";

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

// 判断输入项是否为中文
function detectChinese(word) {
   return /^[\u4e00-\u9fa5]+$/.test(word);
}

// 处理用户输入
function handleOutput(searchWord, callbackSetList = () => { }) {
   callbackSetList([
      {
         title: "正在查询中，请稍后",
      },
   ]);
   const isChinese = detectChinese(searchWord);
   axios({
      url: getUrl(searchWord),
      method: "get",
   })
      .then((res) => {
         const { translation, basic, web, errorCode } = res.data;
         if (errorCode === "0") {
            const commonObj = {
               searchWord,
               isChinese,
               icon: normalIcon,
            }
            const list = translation.map((val) => ({
               title: val,
               description: searchWord,
               ...commonObj,
            }));
            if (basic && basic["us-phonetic"]) {
               list.push({
                  title: `[美：${basic["us-phonetic"]}] [英：${basic["uk-phonetic"]}]`,
                  description: searchWord,
                  ...commonObj,
               });
            } else if (basic && basic["phonetic"]) {
               list.push({
                  title: basic["phonetic"],
                  description: translation[0],
                  ...commonObj,
               });
            }
            basic &&
               list.push(
                  ...basic.explains.map((val) => ({
                     title: val,
                     description: searchWord,
                     ...commonObj,
                  }))
               );
            web &&
               list.push(
                  ...web.map((val) => ({
                     title: val.value.join("，"),
                     description: val.key,
                     ...commonObj,
                  }))
               );
            callbackSetList(list);
         } else if (errorCode === "108") {
            callbackSetList([
               {
                  title: messages[errorCode],
                  description: "请重新配置appkey与appsecret",
                  icon: "./logo.png",
                  redirect: "懒人翻译小助手配置",
               },
            ]);
         } else {
            callbackSetList([
               {
                  title: messages[errorCode],
               },
            ]);
         }
      })
      .catch((err) => {
         callbackSetList([
            {
               title: err.toString(),
               description: "回车前往百度搜索",
               url: `https://www.baidu.com/s?wd=${searchWord}`,
            },
         ]);
      });
}

// 处理打开详情的情况
function openDetail(item) {
   const record = utools.db.get('translate-record');
   if (record) {
      utools.db.put({
         _id: 'translate-record',
         data: item,
         _rev: record._rev,
      })
   } else {
      utools.db.put({
         _id: 'translate-record',
         data: item,
      })
   }
   const ubWindow = utools.createBrowserWindow(
      "./template/translate.html",
      {
         show: false,
         width: 600,
         height: 480,
         title: "翻译",
         webPreferences: {
            preload: "preload.js",
         },
      },
      () => {
         // 显示
         ubWindow.show();
         // 置顶
         ubWindow.setAlwaysOnTop(true);
      }
   );
}

// 复制到剪贴板
function copyToClipboard(item) {
   window.utools.hideMainWindow();
   utools.copyText(item.title);
   window.utools.outPlugin();
}

// 发音
function pronounce(description) {
   execSync(`/bin/bash
      cd $TMPDIR
      query="${description}"
      voice="youdao-\${query}.mp3"
      
      echo say: "$voice" >&2
      
      if [[ ! -e \${voice} ]]; then
        curl -SL#o "$voice" -# -d "audio=\${query}" -d "type=1" "https://dict.youdao.com/dictvoice"
      fi
      
      afplay "$voice"`);
}

// 选择翻译项
function handleSelect(itemData, callbackSetList) {
   const { title, description, action, redirect, isChinese, searchWord, item } = itemData;
   if (redirect) {
      return utools.redirect(redirect);
   }
   if (action) {
      switch (action) {
         case "copy":
            copyToClipboard(item);
            break;
         case "detail":
            openDetail(item);
            break;
         case "say":
            pronounce(description);
            break;
         case "back":
            handleOutput(searchWord, callbackSetList);
            break;
      }
   } else {
      const list = [
         {
            item: itemData,
            ...itemData,
            title: "复制内容",
            description: title,
            action: "copy",
         },
         {
            item: itemData,
            ...itemData,
            title: "打开详情",
            description: title,
            action: "detail",
         },
      ];
      !utools.isWindows() && list.push({ item: itemData, ...itemData, title: "听发音", description: isChinese ? title : description, action: "say", icon: pronounceIcon });
      list.push({
         item: itemData,
         ...itemData,
         title: "返回",
         description: '返回上一步操作',
         action: 'back',
      });
      callbackSetList(list);
   }
}

// 初始化appkey与appsecret
function initAppConfig() {
   const record = utools.db.get("yd");
   if (record) {
      appkey = record.data.appkey;
      appsecret = record.data.appsecret;
      return true;
   } else {
      utools.showNotification("请先配置appkey和appsecrect");
      setTimeout(() => {
         utools.redirect("懒人翻译小助手配置");
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
         select: (action, itemData, callbackSetList) => {
            handleSelect(itemData, callbackSetList);
         },
         placeholder: "请输入要翻译的内容",
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
         select: (action, itemData, callbackSetList) => {
            handleSelect(itemData, callbackSetList);
         },
         placeholder: "请输入要翻译的内容",
      },
   },
   "utools-config": {
      mode: "list",
      args: {
         enter: () => {
            const ubWindow = utools.createBrowserWindow(
               "./template/config.html",
               {
                  show: false,
                  width: 600,
                  height: 480,
                  title: "配置窗口",
                  webPreferences: {
                     preload: "preload.js",
                  },
               },
               () => {
                  // 显示
                  ubWindow.show();
                  // 置顶
                  ubWindow.setAlwaysOnTop(true);
                  console.log(ubWindow.on);
                  // ubWindow.addEventListener("close", () => {})
               }
            );
         },
      },
   },
};
