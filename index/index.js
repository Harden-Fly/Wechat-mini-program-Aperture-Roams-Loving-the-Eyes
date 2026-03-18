// ================= Bmob 免费后端配置区 =================
// ⚠️ 请将下面引号里的汉字，替换成你自己在 Bmob 后台复制的真实密钥
const BMOB_APP_ID = '替换成你的Application ID';
const BMOB_REST_KEY = '替换成你的REST API Key';
// =======================================================

const BASE_URL = 'https://api.bmobcloud.com/1/classes';

// 解决 iOS 苹果手机解析日期出现 NaN 的兼容性补丁
const parseDt = (str) => new Date(str.replace(/-/g, '/'));
const formatDt = (dObj) => {
  let y = dObj.getFullYear();
  let m = String(dObj.getMonth() + 1).padStart(2, '0');
  let d = String(dObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const bmobRequest = (path, method = 'GET', data = {}) => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}/${path}`,
      method: method,
      data: data,
      header: {
        'X-Bmob-Application-Id': BMOB_APP_ID,
        'X-Bmob-REST-API-Key': BMOB_REST_KEY,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else if (res.data && res.data.code === 101) {
          resolve({ results: [] }); // 拦截首次建表错误
        } else {
          console.error(`Bmob请求错误 [${path}]:`, res);
          reject(res);
        }
      },
      fail: reject
    })
  })
}

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 64,
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    days: [],
    emptyDays: [],
    
    currentUser: null,
    tempAvatar: '',
    tempNickname: '',
    managers: [],
    isManagersSheetOpen: false,

    devices: [],
    currentDeviceId: '',
    currentDeviceName: '加载中...',
    currentDeviceIcon: '📸',
    currentDeviceEditorAvatar: '',
    statusMap: {},
    
    selectingStartDate: null, 
    rentalSummaryList: [],    
    
    // ======== 🌟 更新：扩充了符合大疆设备的精选 Emoji 图标库 ========
    // 增加了 🤳(手持vlog), 🏂(运动相机屏幕里的滑雪), 🧿(硕大镜头), 🤿(潜水运动), 🦯(云台手柄)
    availableIcons: ['📸', '📹', '🎬', '🚁', '📱', '💻', '🎒', '🔋', '🎙️', '🔦', '🤳', '🏂', '🧿', '🤿', '🦯'],
    selectedIcon: '📸',
    
    isDeviceSheetOpen: false,
    isAddModalOpen: false,
    newDeviceName: '',
    isEditModalOpen: false,
    editingDeviceId: '',
    editingDeviceName: ''
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight,
      navBarHeight: sysInfo.statusBarHeight + 44
    });

    const savedUser = wx.getStorageSync('currentUser');
    if (savedUser) {
      this.setData({ currentUser: savedUser });
      this.initData();
    }
  },

  onShareAppMessage() {
    return {
      title: `邀请你一起管理【${this.data.currentDeviceName}】的档期`,
      path: '/pages/index/index'
    }
  },

  onChooseAvatar(e) { this.setData({ tempAvatar: e.detail.avatarUrl }); },
  onNicknameInput(e) { this.setData({ tempNickname: e.detail.value }); },

  async handleRealLogin() {
    const { tempAvatar, tempNickname } = this.data;
    if (!tempAvatar || !tempNickname) return wx.showToast({ title: '请授权信息', icon: 'none' });

    wx.showLoading({ title: '登录中...' });
    wx.uploadFile({
      url: `https://api.bmobcloud.com/2/files/avatar_${Date.now()}.png`,
      filePath: tempAvatar,
      name: 'file',
      header: { 'X-Bmob-Application-Id': BMOB_APP_ID, 'X-Bmob-REST-API-Key': BMOB_REST_KEY },
      success: (uploadRes) => {
        if (uploadRes.statusCode === 200) {
          const fileData = JSON.parse(uploadRes.data);
          const userProfile = { name: tempNickname, avatar: fileData.url };
          bmobRequest('users', 'POST', userProfile).then(addRes => {
            userProfile._id = addRes.objectId; 
            this.setData({ currentUser: userProfile });
            wx.setStorageSync('currentUser', userProfile);
            this.initData();
            wx.hideLoading();
          }).catch(() => { wx.hideLoading(); wx.showToast({ title: '数据库连接失败', icon: 'none' }); });
        } else {
          wx.hideLoading(); wx.showToast({ title: '头像上传失败', icon: 'none' });
        }
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '请求失败', icon: 'none' }); }
    });
  },

  initData() {
    this.fetchManagers();
    this.fetchCloudData();
  },

  fetchManagers() {
    bmobRequest('users').then(data => {
      let mappedManagers = (data.results || []).map(u => ({ ...u, _id: u.objectId }));
      this.setData({ managers: mappedManagers });
    }).catch(err => console.error(err));
  },
  
  openManagersSheet() { this.setData({ isManagersSheetOpen: true }); },
  closeManagersSheet() { this.setData({ isManagersSheetOpen: false }); },

  fetchCloudData() {
    wx.showLoading({ title: '加载数据中...' });
    
    bmobRequest('devices').then(data => {
      let loadedDevices = (data.results || []).map(d => ({ ...d, _id: d.objectId, icon: d.icon || '📸' }));
      if (loadedDevices.length === 0) {
        const defaultAvatar = this.data.currentUser ? this.data.currentUser.avatar : '';
        return bmobRequest('devices', 'POST', { name: 'DJI Pocket 3', icon: '🤳', lastEditorAvatar: defaultAvatar }).then(addRes => {
          this.setData({ 
            devices: [{ _id: addRes.objectId, name: 'DJI Pocket 3', icon: '🤳', lastEditorAvatar: defaultAvatar }],
            currentDeviceId: addRes.objectId, currentDeviceName: 'DJI Pocket 3', currentDeviceIcon: '🤳', currentDeviceEditorAvatar: defaultAvatar
          });
          return bmobRequest('rentals');
        });
      } else {
        let currentDev = loadedDevices.find(d => d._id === (this.data.currentDeviceId || loadedDevices[0]._id)) || loadedDevices[0];
        this.setData({ 
          devices: loadedDevices, currentDeviceId: currentDev._id, 
          currentDeviceName: currentDev.name, currentDeviceIcon: currentDev.icon, currentDeviceEditorAvatar: currentDev.lastEditorAvatar || ''
        });
        return bmobRequest('rentals');
      }
    }).then(data => {
      let newStatusMap = {};
      if (data && data.results) {
        data.results.forEach(item => {
          if (!newStatusMap[item.deviceId]) newStatusMap[item.deviceId] = {};
          newStatusMap[item.deviceId][item.dateKey] = { 
            status: 'rented', user: item.user, _id: item.objectId,
            rentalRole: item.rentalRole || 'middle',
            groupId: item.groupId || ''
          };
        });
      }
      this.setData({ statusMap: newStatusMap }, () => {
        this.updateCalendar();
        wx.hideLoading();
      });
    }).catch(() => { wx.hideLoading(); });
  },

  updateCalendar() {
    const { year, month, statusMap, currentDeviceId, selectingStartDate } = this.data;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();

    let emptyDays = Array(firstDay).fill(0);
    let days = [];
    const currentDeviceStatus = statusMap[currentDeviceId] || {};

    for (let d = 1; d <= daysInMonth; d++) {
      let mm = String(month + 1).padStart(2, '0');
      let dd = String(d).padStart(2, '0');
      let dateKey = `${year}-${mm}-${dd}`;
      
      let dayData = currentDeviceStatus[dateKey];
      let isTempStart = (selectingStartDate === dateKey); 
      
      let roleText = '';
      if (dayData?.status === 'rented') {
        if (dayData.rentalRole === 'start') roleText = '起租';
        else if (dayData.rentalRole === 'end') roleText = '归还';
        else if (dayData.rentalRole === 'single') roleText = '租/还';
      }

      days.push({
        day: d, dateKey: dateKey, isRented: dayData?.status === 'rented',
        user: dayData?.user || null, roleText: roleText, isTempStart: isTempStart
      });
    }
    this.setData({ emptyDays, days });
  },

  prevMonth() {
    let { year, month } = this.data;
    if (month === 0) { year -= 1; month = 11; } else { month -= 1; }
    this.setData({ year, month }, () => this.updateCalendar());
  },

  nextMonth() {
    let { year, month } = this.data;
    if (month === 11) { year += 1; month = 0; } else { month += 1; }
    this.setData({ year, month }, () => this.updateCalendar());
  },

  async toggleStatus(e) {
    const day = e.currentTarget.dataset.day;
    const mm = String(this.data.month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const dateKey = `${this.data.year}-${mm}-${dd}`;
    
    let deviceStatus = this.data.statusMap[this.data.currentDeviceId] || {};
    let currentRecord = deviceStatus[dateKey];

    if (currentRecord?.status === 'rented') {
      if (currentRecord.user._id !== this.data.currentUser._id) {
        wx.showModal({
          title: '无权限操作',
          content: '您只能修改自己登记的档期，无法操作其他团队成员的数据。',
          showCancel: false,
          confirmColor: '#2563eb'
        });
        return;
      }

      if (!this.data.selectingStartDate) {
        this.handleDeleteRental(currentRecord);
      } else {
        wx.showToast({ title: '该日期已被租用，请重新选择起租日', icon: 'none', duration: 2500 });
        this.setData({ selectingStartDate: null });
        this.updateCalendar();
      }
      return;
    }

    if (!this.data.selectingStartDate) {
      wx.showToast({ title: '请点击结束归还日期', icon: 'none' });
      this.setData({ selectingStartDate: dateKey });
      this.updateCalendar();
      return;
    }

    let startStr = this.data.selectingStartDate;
    let endStr = dateKey;

    let dStart = parseDt(startStr);
    let dEnd = parseDt(endStr);

    if (dEnd < dStart) {
      let tempStr = startStr; startStr = endStr; endStr = tempStr;
      let tempD = dStart; dStart = dEnd; dEnd = tempD;
    }

    let datesToRent = [];
    let currD = new Date(dStart);
    let isValid = true;
    while(currD <= dEnd) {
      let dKey = formatDt(currD);
      if (deviceStatus[dKey]?.status === 'rented') {
        isValid = false; break;
      }
      datesToRent.push(dKey);
      currD.setDate(currD.getDate() + 1);
    }

    if (!isValid) {
      wx.showToast({ title: '所选区间包含已被租用的日期', icon: 'none', duration: 2500 });
      this.setData({ selectingStartDate: null });
      this.updateCalendar();
      return;
    }

    const daysCount = datesToRent.length;
    const returnStr = `${dEnd.getMonth()+1}月${dEnd.getDate()}日`;
    const summary = `【${this.data.currentDeviceName}】租用 ${daysCount} 天，${returnStr} 归还。`;
    const groupId = Date.now().toString(); 

    let currentSummaryList = [...this.data.rentalSummaryList];
    if (currentSummaryList.length >= 3) {
      wx.showToast({ title: '最早的记录已滚动清除', icon: 'none' });
      currentSummaryList.shift(); 
    }
    currentSummaryList.push(summary);

    wx.showLoading({ title: '档期登记中...', mask: true });

    try {
      for (let i = 0; i < datesToRent.length; i++) {
        let dKey = datesToRent[i];
        let role = 'middle';
        if (daysCount === 1) role = 'single';
        else if (i === 0) role = 'start';
        else if (i === daysCount - 1) role = 'end';

        await bmobRequest('rentals', 'POST', {
          dateKey: dKey, deviceId: this.data.currentDeviceId,
          user: this.data.currentUser, rentalRole: role, groupId: groupId
        });
      }

      this.setData({ selectingStartDate: null, rentalSummaryList: currentSummaryList });
      this.fetchCloudData();
      wx.showToast({ title: '档期登记成功', icon: 'success' });
    } catch (err) {
      console.error("添加失败:", err);
      wx.hideLoading(); 
      wx.showToast({ title: '网络波动，请检查', icon: 'none' });
      this.setData({ selectingStartDate: null });
      this.fetchCloudData();
    }
  },

  handleDeleteRental(record) {
    wx.showModal({
      title: '取消/删除档期',
      content: '确定要取消并清空该段档期记录吗？',
      confirmColor: '#ef4444',
      success: async (res) => { 
        if (res.confirm) {
          wx.showLoading({ title: '删除中...', mask: true });
          let idsToDelete = [];
          if (record.groupId) {
            const devMap = this.data.statusMap[this.data.currentDeviceId] || {};
            for (let k in devMap) {
              if (devMap[k].groupId === record.groupId) idsToDelete.push(devMap[k]._id);
            }
          } else {
            idsToDelete.push(record._id);
          }

          try {
            for (let id of idsToDelete) {
              await bmobRequest(`rentals/${id}`, 'DELETE');
            }
            this.fetchCloudData();
            wx.showToast({ title: '已取消档期', icon: 'success' });
          } catch (err) {
            wx.hideLoading(); 
            wx.showToast({ title: '部分删除失败', icon: 'none' });
            this.fetchCloudData();
          }
        }
      }
    });
  },

  openDeviceSheet() { this.setData({ isDeviceSheetOpen: true }); },
  closeDeviceSheet() { this.setData({ isDeviceSheetOpen: false }); },
  preventBubble() {},

  switchDevice(e) {
    const id = e.currentTarget.dataset.id;
    const device = this.data.devices.find(d => d._id === id);
    this.setData({ 
      currentDeviceId: id, currentDeviceName: device.name,
      currentDeviceIcon: device.icon || '📸',
      currentDeviceEditorAvatar: device.lastEditorAvatar || '',
      isDeviceSheetOpen: false, rentalSummaryList: [], selectingStartDate: null
    }, () => this.updateCalendar());
  },

  selectIcon(e) { this.setData({ selectedIcon: e.currentTarget.dataset.icon }); },

  openAddModal() { this.setData({ isDeviceSheetOpen: false, isAddModalOpen: true, newDeviceName: '', selectedIcon: '📸' }); },
  closeAddModal() { this.setData({ isAddModalOpen: false }); },
  onAddDeviceNameInput(e) { this.setData({ newDeviceName: e.detail.value }); },
  
  handleAddDevice() {
    const name = this.data.newDeviceName.trim();
    if (!name) return;
    wx.showLoading({ title: '添加中...' });
    bmobRequest('devices', 'POST', { name: name, icon: this.data.selectedIcon, lastEditorAvatar: this.data.currentUser.avatar }).then(() => {
      this.setData({ isAddModalOpen: false, rentalSummaryList: [], selectingStartDate: null });
      this.fetchCloudData();
    }).catch(()=>{ wx.hideLoading(); });
  },

  openEditModal(e) {
    const device = e.currentTarget.dataset.device;
    this.setData({ 
      isDeviceSheetOpen: false, isEditModalOpen: true, 
      editingDeviceId: device._id, editingDeviceName: device.name,
      selectedIcon: device.icon || '📸'
    });
  },
  closeEditModal() { this.setData({ isEditModalOpen: false }); },
  onEditDeviceNameInput(e) { this.setData({ editingDeviceName: e.detail.value }); },

  handleEditDevice() {
    const name = this.data.editingDeviceName.trim();
    if (!name) return;
    wx.showLoading({ title: '修改中...' });
    bmobRequest('devices/' + this.data.editingDeviceId, 'PUT', { name: name, icon: this.data.selectedIcon, lastEditorAvatar: this.data.currentUser.avatar }).then(() => {
      this.setData({ isEditModalOpen: false }); this.fetchCloudData();
    }).catch(()=>{ wx.hideLoading(); });
  },

  confirmDelete(e) {
    const device = e.currentTarget.dataset.device;
    wx.showModal({
      title: '确认删除设备？', content: `即将删除 ${device.name}，记录将被清空。`, confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          bmobRequest('devices/' + device._id, 'DELETE').then(() => {
            let nextDevice = this.data.devices.find(d => d._id !== device._id);
            if (nextDevice) {
              this.setData({ 
                currentDeviceId: nextDevice._id, currentDeviceName: nextDevice.name, 
                currentDeviceIcon: nextDevice.icon || '📸', currentDeviceEditorAvatar: nextDevice.lastEditorAvatar || ''
              });
            }
            this.fetchCloudData();
          });
        }
      }
    });
  }
});
