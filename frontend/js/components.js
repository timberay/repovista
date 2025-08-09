/**
 * UI 컴포넌트 모듈
 * @version 1.0.0
 */

// 기본 컴포넌트 클래스
class Component {
    constructor(props = {}) {
        this.props = props;
        this.element = null;
        this.state = {};
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.render();
    }

    render() {
        // 하위 클래스에서 구현
        throw new Error('render 메서드를 구현해야 합니다.');
    }

    mount(container) {
        this.element = this.render();
        if (container) {
            container.appendChild(this.element);
        }
        return this.element;
    }

    unmount() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}

// 버튼 컴포넌트
class Button extends Component {
    render() {
        const { text, type = 'button', className = '', onClick, disabled = false } = this.props;
        
        const button = document.createElement('button');
        button.type = type;
        button.className = `btn ${className}`;
        button.textContent = text;
        button.disabled = disabled;
        
        if (onClick) {
            button.addEventListener('click', onClick);
        }
        
        return button;
    }
}

// 입력 필드 컴포넌트
class Input extends Component {
    render() {
        const { 
            type = 'text', 
            placeholder = '', 
            value = '', 
            className = '',
            onChange,
            onKeyDown
        } = this.props;
        
        const input = document.createElement('input');
        input.type = type;
        input.placeholder = placeholder;
        input.value = value;
        input.className = `input ${className}`;
        
        if (onChange) {
            input.addEventListener('input', onChange);
        }
        
        if (onKeyDown) {
            input.addEventListener('keydown', onKeyDown);
        }
        
        return input;
    }
}

// 카드 컴포넌트
class Card extends Component {
    render() {
        const { title, content, className = '', onClick } = this.props;
        
        const card = document.createElement('div');
        card.className = `card ${className}`;
        
        if (title) {
            const titleEl = document.createElement('h3');
            titleEl.className = 'card-title';
            titleEl.textContent = title;
            card.appendChild(titleEl);
        }
        
        if (content) {
            const contentEl = document.createElement('div');
            contentEl.className = 'card-content';
            contentEl.innerHTML = content;
            card.appendChild(contentEl);
        }
        
        if (onClick) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', onClick);
        }
        
        return card;
    }
}

// 모달 컴포넌트
class Modal extends Component {
    constructor(props) {
        super(props);
        this.isOpen = false;
    }

    open() {
        this.isOpen = true;
        this.render();
    }

    close() {
        this.isOpen = false;
        this.render();
    }

    render() {
        const { title, content, onClose } = this.props;
        
        if (!this.isOpen) {
            return document.createElement('div');
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        
        const header = document.createElement('div');
        header.className = 'modal-header';
        
        const titleEl = document.createElement('h2');
        titleEl.textContent = title;
        header.appendChild(titleEl);
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => {
            this.close();
            if (onClose) onClose();
        });
        header.appendChild(closeBtn);
        
        modalContent.appendChild(header);
        
        const body = document.createElement('div');
        body.className = 'modal-body';
        body.innerHTML = content;
        modalContent.appendChild(body);
        
        modal.appendChild(modalContent);
        
        // 배경 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.close();
                if (onClose) onClose();
            }
        });
        
        return modal;
    }
}

// 로딩 스피너 컴포넌트
class Spinner extends Component {
    render() {
        const { size = 'medium', text = '로딩 중...' } = this.props;
        
        const container = document.createElement('div');
        container.className = `spinner-container spinner-${size}`;
        
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        container.appendChild(spinner);
        
        if (text) {
            const textEl = document.createElement('p');
            textEl.className = 'spinner-text';
            textEl.textContent = text;
            container.appendChild(textEl);
        }
        
        return container;
    }
}

// 알림 컴포넌트
class Alert extends Component {
    constructor(props) {
        super(props);
        this.timeout = null;
    }

    show(duration = 3000) {
        this.render();
        
        if (duration > 0) {
            this.timeout = setTimeout(() => {
                this.hide();
            }, duration);
        }
    }

    hide() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        this.unmount();
    }

    render() {
        const { type = 'info', message, onClose } = this.props;
        
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        
        const messageEl = document.createElement('span');
        messageEl.textContent = message;
        alert.appendChild(messageEl);
        
        if (onClose) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'alert-close';
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', () => {
                this.hide();
                onClose();
            });
            alert.appendChild(closeBtn);
        }
        
        return alert;
    }
}

// 태그 컴포넌트
class Tag extends Component {
    render() {
        const { text, color = 'default', onClick, removable = false, onRemove } = this.props;
        
        const tag = document.createElement('span');
        tag.className = `tag tag-${color}`;
        tag.textContent = text;
        
        if (onClick) {
            tag.style.cursor = 'pointer';
            tag.addEventListener('click', onClick);
        }
        
        if (removable) {
            const removeBtn = document.createElement('span');
            removeBtn.className = 'tag-remove';
            removeBtn.innerHTML = '&times;';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (onRemove) onRemove();
            });
            tag.appendChild(removeBtn);
        }
        
        return tag;
    }
}

// 페이지네이션 컴포넌트
class Pagination extends Component {
    render() {
        const { 
            currentPage = 1, 
            totalPages = 1, 
            onPageChange,
            showFirstLast = true,
            maxVisible = 5
        } = this.props;
        
        const container = document.createElement('div');
        container.className = 'pagination';
        
        // 첫 페이지 버튼
        if (showFirstLast && currentPage > 1) {
            const firstBtn = document.createElement('button');
            firstBtn.className = 'pagination-btn';
            firstBtn.textContent = '«';
            firstBtn.addEventListener('click', () => onPageChange(1));
            container.appendChild(firstBtn);
        }
        
        // 이전 페이지 버튼
        if (currentPage > 1) {
            const prevBtn = document.createElement('button');
            prevBtn.className = 'pagination-btn';
            prevBtn.textContent = '‹';
            prevBtn.addEventListener('click', () => onPageChange(currentPage - 1));
            container.appendChild(prevBtn);
        }
        
        // 페이지 번호들
        const startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        const endPage = Math.min(totalPages, startPage + maxVisible - 1);
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener('click', () => onPageChange(i));
            container.appendChild(pageBtn);
        }
        
        // 다음 페이지 버튼
        if (currentPage < totalPages) {
            const nextBtn = document.createElement('button');
            nextBtn.className = 'pagination-btn';
            nextBtn.textContent = '›';
            nextBtn.addEventListener('click', () => onPageChange(currentPage + 1));
            container.appendChild(nextBtn);
        }
        
        // 마지막 페이지 버튼
        if (showFirstLast && currentPage < totalPages) {
            const lastBtn = document.createElement('button');
            lastBtn.className = 'pagination-btn';
            lastBtn.textContent = '»';
            lastBtn.addEventListener('click', () => onPageChange(totalPages));
            container.appendChild(lastBtn);
        }
        
        return container;
    }
}

// 드롭다운 컴포넌트
class Dropdown extends Component {
    constructor(props) {
        super(props);
        this.isOpen = false;
    }

    toggle() {
        this.isOpen = !this.isOpen;
        this.render();
    }

    close() {
        this.isOpen = false;
        this.render();
    }

    render() {
        const { 
            trigger, 
            items = [], 
            onSelect,
            className = ''
        } = this.props;
        
        const container = document.createElement('div');
        container.className = `dropdown ${className}`;
        
        const triggerEl = document.createElement('div');
        triggerEl.className = 'dropdown-trigger';
        triggerEl.innerHTML = trigger;
        triggerEl.addEventListener('click', () => this.toggle());
        container.appendChild(triggerEl);
        
        if (this.isOpen) {
            const menu = document.createElement('div');
            menu.className = 'dropdown-menu';
            
            items.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.className = 'dropdown-item';
                itemEl.textContent = item.label || item;
                itemEl.addEventListener('click', () => {
                    if (onSelect) onSelect(item.value || item);
                    this.close();
                });
                menu.appendChild(itemEl);
            });
            
            container.appendChild(menu);
        }
        
        // 외부 클릭 시 닫기
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                this.close();
            }
        });
        
        return container;
    }
}

// 컴포넌트 팩토리 함수들
const createButton = (props) => new Button(props);
const createInput = (props) => new Input(props);
const createCard = (props) => new Card(props);
const createModal = (props) => new Modal(props);
const createSpinner = (props) => new Spinner(props);
const createAlert = (props) => new Alert(props);
const createTag = (props) => new Tag(props);
const createPagination = (props) => new Pagination(props);
const createDropdown = (props) => new Dropdown(props);

// 전역으로 노출
window.components = {
    Component,
    Button,
    Input,
    Card,
    Modal,
    Spinner,
    Alert,
    Tag,
    Pagination,
    Dropdown,
    createButton,
    createInput,
    createCard,
    createModal,
    createSpinner,
    createAlert,
    createTag,
    createPagination,
    createDropdown
};
