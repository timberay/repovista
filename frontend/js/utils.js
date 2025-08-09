/**
 * 유틸리티 함수 모듈
 * @version 1.0.0
 */

// 날짜 포맷팅
export const formatDate = (date, format = 'YYYY-MM-DD') => {
    if (!date) return '';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
};

// 상대적 시간 표시 (예: 3일 전, 1시간 전)
export const formatRelativeTime = (date) => {
    if (!date) return '';
    
    const now = new Date();
    const target = new Date(date);
    const diffMs = now - target;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffYears > 0) return `${diffYears}년 전`;
    if (diffMonths > 0) return `${diffMonths}개월 전`;
    if (diffDays > 0) return `${diffDays}일 전`;
    if (diffHours > 0) return `${diffHours}시간 전`;
    if (diffMinutes > 0) return `${diffMinutes}분 전`;
    return '방금 전';
};

// 숫자 포맷팅 (천 단위 콤마)
export const formatNumber = (num) => {
    if (num === null || num === undefined) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// 파일 크기 포맷팅
export const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 문자열 자르기
export const truncate = (str, length = 100, suffix = '...') => {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substring(0, length) + suffix;
};

// HTML 이스케이프
export const escapeHtml = (str) => {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

// URL 파라미터 파싱
export const parseQueryString = (queryString) => {
    const params = new URLSearchParams(queryString);
    const result = {};
    for (const [key, value] of params) {
        result[key] = value;
    }
    return result;
};

// URL 파라미터 생성
export const buildQueryString = (params) => {
    return new URLSearchParams(params).toString();
};

// 디바운스 함수
export const debounce = (func, wait, immediate = false) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func(...args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func(...args);
    };
};

// 쓰로틀 함수
export const throttle = (func, limit) => {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

// 로컬 스토리지 래퍼
export const storage = {
    set: (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error('로컬 스토리지 저장 실패:', error);
        }
    },
    
    get: (key, defaultValue = null) => {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('로컬 스토리지 읽기 실패:', error);
            return defaultValue;
        }
    },
    
    remove: (key) => {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error('로컬 스토리지 삭제 실패:', error);
        }
    },
    
    clear: () => {
        try {
            localStorage.clear();
        } catch (error) {
            console.error('로컬 스토리지 초기화 실패:', error);
        }
    }
};

// 세션 스토리지 래퍼
export const sessionStorage = {
    set: (key, value) => {
        try {
            window.sessionStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error('세션 스토리지 저장 실패:', error);
        }
    },
    
    get: (key, defaultValue = null) => {
        try {
            const item = window.sessionStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('세션 스토리지 읽기 실패:', error);
            return defaultValue;
        }
    },
    
    remove: (key) => {
        try {
            window.sessionStorage.removeItem(key);
        } catch (error) {
            console.error('세션 스토리지 삭제 실패:', error);
        }
    },
    
    clear: () => {
        try {
            window.sessionStorage.clear();
        } catch (error) {
            console.error('세션 스토리지 초기화 실패:', error);
        }
    }
};

// 배열 유틸리티
export const arrayUtils = {
    // 배열 중복 제거
    unique: (arr) => [...new Set(arr)],
    
    // 배열 그룹화
    groupBy: (arr, key) => {
        return arr.reduce((groups, item) => {
            const group = item[key];
            groups[group] = groups[group] || [];
            groups[group].push(item);
            return groups;
        }, {});
    },
    
    // 배열 정렬
    sortBy: (arr, key, order = 'asc') => {
        return [...arr].sort((a, b) => {
            let aVal = a[key];
            let bVal = b[key];
            
            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }
            
            if (order === 'desc') {
                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            }
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        });
    },
    
    // 배열 필터링
    filterBy: (arr, filters) => {
        return arr.filter(item => {
            return Object.keys(filters).every(key => {
                const filterValue = filters[key];
                const itemValue = item[key];
                
                if (typeof filterValue === 'string') {
                    return itemValue.toLowerCase().includes(filterValue.toLowerCase());
                }
                return itemValue === filterValue;
            });
        });
    }
};

// 객체 유틸리티
export const objectUtils = {
    // 깊은 복사
    deepClone: (obj) => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => objectUtils.deepClone(item));
        if (typeof obj === 'object') {
            const clonedObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    clonedObj[key] = objectUtils.deepClone(obj[key]);
                }
            }
            return clonedObj;
        }
    },
    
    // 객체 병합
    merge: (target, ...sources) => {
        return sources.reduce((merged, source) => {
            for (const key in source) {
                if (source.hasOwnProperty(key)) {
                    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                        merged[key] = objectUtils.merge(merged[key] || {}, source[key]);
                    } else {
                        merged[key] = source[key];
                    }
                }
            }
            return merged;
        }, { ...target });
    },
    
    // 객체에서 특정 키들만 추출
    pick: (obj, keys) => {
        return keys.reduce((result, key) => {
            if (obj.hasOwnProperty(key)) {
                result[key] = obj[key];
            }
            return result;
        }, {});
    },
    
    // 객체에서 특정 키들 제외
    omit: (obj, keys) => {
        return Object.keys(obj).reduce((result, key) => {
            if (!keys.includes(key)) {
                result[key] = obj[key];
            }
            return result;
        }, {});
    }
};

// DOM 유틸리티
export const domUtils = {
    // 요소 생성
    createElement: (tag, attributes = {}, children = []) => {
        const element = document.createElement(tag);
        
        // 속성 설정
        Object.keys(attributes).forEach(key => {
            if (key === 'className') {
                element.className = attributes[key];
            } else if (key === 'textContent') {
                element.textContent = attributes[key];
            } else {
                element.setAttribute(key, attributes[key]);
            }
        });
        
        // 자식 요소 추가
        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else {
                element.appendChild(child);
            }
        });
        
        return element;
    },
    
    // 요소 찾기
    find: (selector, parent = document) => {
        return parent.querySelector(selector);
    },
    
    // 요소들 찾기
    findAll: (selector, parent = document) => {
        return Array.from(parent.querySelectorAll(selector));
    },
    
    // 이벤트 리스너 추가
    on: (element, event, handler, options = {}) => {
        element.addEventListener(event, handler, options);
        return () => element.removeEventListener(event, handler, options);
    },
    
    // 요소 표시/숨김
    show: (element) => {
        element.style.display = '';
    },
    
    hide: (element) => {
        element.style.display = 'none';
    },
    
    // 요소 토글
    toggle: (element) => {
        element.style.display = element.style.display === 'none' ? '' : 'none';
    }
};

// 전역으로 노출
window.utils = {
    formatDate,
    formatRelativeTime,
    formatNumber,
    formatFileSize,
    truncate,
    escapeHtml,
    parseQueryString,
    buildQueryString,
    debounce,
    throttle,
    storage,
    sessionStorage,
    arrayUtils,
    objectUtils,
    domUtils
};
