// ==================== CONFIGURATION ====================
const API_URL = 'http://localhost:5000/api';
const TOKEN_KEY = 'getyourstuff_token';
const USER_KEY = 'getyourstuff_user';

// Component Configuration
const COMPONENTS = {
    'navbar': 'navbar-container',
    'hero': 'hero-container',
    'categories': 'categories-container',
    'product-grid': 'products-container',
    'sell-form': 'sell-form-container',
    'cart': 'cart-modal-container',
    'auth-modal': 'auth-modal-container',
    'orders': 'orders-container',
    'footer': 'footer-container'
};

// ==================== STATE MANAGEMENT ====================
let state = {
    user: null,
    cart: [],
    products: [],
    currentPage: 1,
    totalPages: 1,
    searchQuery: '',
    categoryFilter: '',
    sortFilter: 'newest',
    componentLoader: null
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
});

async function initializeApp() {
    try {
        // Initialize Component Loader
        state.componentLoader = new ComponentLoader('components/');
        
        // Load all components
        await loadAllComponents();
        
        // Check for existing session
        await checkSession();
        
        // Load initial products
        await loadProducts();
        
        // Setup event listeners
        setupEventListeners();
        
        // Update UI based on user state
        updateUI();
        
        console.log('✅ App initialized successfully');
    } catch (error) {
        console.error('❌ App initialization failed:', error);
        showNotification('Failed to initialize application', 'error');
    }
}

// ==================== COMPONENT LOADING FUNCTIONS ====================
async function loadAllComponents() {
    const componentList = Object.entries(COMPONENTS).map(([name, targetId]) => ({
        name,
        targetId
    }));

    try {
        await state.componentLoader.loadMultipleComponents(componentList);
        console.log('✅ All components loaded successfully');
    } catch (error) {
        console.error('❌ Failed to load components:', error);
        throw error;
    }
}

async function loadComponent(componentName, targetId) {
    try {
        await state.componentLoader.loadComponent(componentName, targetId);
        console.log(`✅ Component ${componentName} loaded successfully`);
    } catch (error) {
        console.error(`❌ Failed to load ${componentName}:`, error);
        throw error;
    }
}

// ==================== SESSION MANAGEMENT ====================
async function checkSession() {
    const token = localStorage.getItem(TOKEN_KEY);
    const userData = localStorage.getItem(USER_KEY);
    
    if (token && userData) {
        try {
            const response = await fetch(`${API_URL}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                state.user = data.user;
                localStorage.setItem(USER_KEY, JSON.stringify(data.user));
                updateUI();
                return;
            }
        } catch (error) {
            console.error('Session check failed:', error);
            clearSession();
        }
    }
    clearSession();
}

function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    state.user = null;
    state.cart = [];
    updateUI();
}

function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    state.user = user;
    updateUI();
}

// ==================== API FUNCTIONS ====================
async function fetchAPI(endpoint, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers
        });
        
        if (response.status === 401) {
            clearSession();
            throw new Error('Unauthorized');
        }
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'API Error');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ==================== AUTHENTICATION ====================
async function login(email, password) {
    try {
        const data = await fetchAPI('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        
        setSession(data.token, data.user);
        showNotification('Login successful!', 'success');
        return true;
    } catch (error) {
        showNotification(error.message, 'error');
        return false;
    }
}

async function register(name, email, password, role) {
    try {
        const data = await fetchAPI('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, password, role })
        });
        
        setSession(data.token, data.user);
        showNotification('Registration successful!', 'success');
        return true;
    } catch (error) {
        showNotification(error.message, 'error');
        return false;
    }
}

async function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    state.user = null;
    state.cart = [];
    updateUI();
    showNotification('Logged out successfully!', 'success');
}

// ==================== PRODUCT FUNCTIONS ====================
async function loadProducts(page = 1, filters = {}) {
    try {
        const params = new URLSearchParams({
            page: page,
            limit: 12,
            ...filters
        });
        
        const data = await fetchAPI(`/products?${params}`);
        state.products = data.products;
        state.currentPage = data.currentPage;
        state.totalPages = data.totalPages;
        
        renderProducts(data.products);
        renderPagination(data.totalPages);
    } catch (error) {
        console.error('Failed to load products:', error);
        showNotification('Failed to load products', 'error');
    }
}

async function createProduct(formData) {
    try {
        const data = await fetchAPI('/products', {
            method: 'POST',
            body: formData
        });
        
        showNotification('Product listed successfully!', 'success');
        document.getElementById('sellForm').reset();
        loadProducts();
        return true;
    } catch (error) {
        showNotification(error.message, 'error');
        return false;
    }
}

async function getProductsByCategory(category) {
    try {
        const data = await fetchAPI(`/products?category=${category}&limit=12`);
        state.products = data.products;
        renderProducts(data.products);
    } catch (error) {
        console.error('Failed to load category products:', error);
    }
}

// ==================== CART FUNCTIONS ====================
function addToCart(product) {
    const existingItem = state.cart.find(item => item.product._id === product._id);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        state.cart.push({
            product,
            quantity: 1
        });
    }
    
    updateCartUI();
    showNotification('Added to cart!', 'success');
}

function removeFromCart(productId) {
    state.cart = state.cart.filter(item => item.product._id !== productId);
    updateCartUI();
}

function updateCartQuantity(productId, quantity) {
    const item = state.cart.find(item => item.product._id === productId);
    if (item) {
        item.quantity = Math.max(1, quantity);
        updateCartUI();
    }
}

function updateCartUI() {
    const cartCount = state.cart.reduce((total, item) => total + item.quantity, 0);
    document.getElementById('cartCount').textContent = cartCount;
    
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    
    if (state.cart.length === 0) {
        cartItems.innerHTML = '<p class="empty-cart">Your cart is empty</p>';
        cartTotal.textContent = '$0.00';
        return;
    }
    
    let total = 0;
    cartItems.innerHTML = state.cart.map(item => {
        const itemTotal = item.product.price * item.quantity;
        total += itemTotal;
        
        return `
            <div class="cart-item">
                <img src="${item.product.images[0] || 'https://via.placeholder.com/100'}" alt="${item.product.title}">
                <div class="cart-item-details">
                    <h4>${item.product.title}</h4>
                    <p>$${item.product.price.toFixed(2)}</p>
                    <div class="cart-item-quantity">
                        <button onclick="updateCartQuantity('${item.product._id}', ${item.quantity - 1})">-</button>
                        <span>${item.quantity}</span>
                        <button onclick="updateCartQuantity('${item.product._id}', ${item.quantity + 1})">+</button>
                    </div>
                </div>
                <button class="remove-btn" onclick="removeFromCart('${item.product._id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');
    
    cartTotal.textContent = `$${total.toFixed(2)}`;
}

// ==================== ORDER FUNCTIONS ====================
async function createOrder(orderData) {
    try {
        const data = await fetchAPI('/orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
        
        state.cart = [];
        updateCartUI();
        showNotification('Order placed successfully!', 'success');
        loadOrders();
        return true;
    } catch (error) {
        showNotification(error.message, 'error');
        return false;
    }
}

async function loadOrders() {
    if (!state.user) {
        document.getElementById('ordersContainer').innerHTML = '<p>Please login to view orders</p>';
        return;
    }
    
    try {
        const data = await fetchAPI('/orders');
        renderOrders(data.orders);
    } catch (error) {
        console.error('Failed to load orders:', error);
    }
}

// ==================== UI RENDERING ====================
function renderProducts(products) {
    const grid = document.getElementById('productGrid');
    
    if (products.length === 0) {
        grid.innerHTML = '<p class="no-products">No products found</p>';
        return;
    }
    
    grid.innerHTML = products.map(product => `
        <div class="product-card">
            <img src="${product.images[0] || 'https://via.placeholder.com/300'}" alt="${product.title}" class="product-image">
            <div class="product-info">
                <h3 class="product-title">${product.title}</h3>
                <div class="product-rating">
                    ${generateStars(product.rating)}
                    <span class="rating-count">(${product.reviewCount || 0})</span>
                </div>
                <div class="product-price">
                    $${product.price.toFixed(2)}
                    ${product.originalPrice > product.price ? `<span class="original-price">$${product.originalPrice.toFixed(2)}</span>` : ''}
                </div>
                <p class="product-seller">Sold by: ${product.sellerName}</p>
                <button class="add-btn" onclick="addToCart(product)">Add to Cart</button>
            </div>
        </div>
    `).join('');
}

function renderPagination(totalPages) {
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let pages = [];
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= state.currentPage - 1 && i <= state.currentPage + 1)) {
            pages.push(i);
        } else if (pages[pages.length - 1] !== '...') {
            pages.push('...');
        }
    }
    
    pagination.innerHTML = `
        <button class="btn btn-outline" onclick="changePage(${state.currentPage - 1})" ${state.currentPage === 1 ? 'disabled' : ''}>Previous</button>
        ${pages.map(page => 
            page === '...' ? 
            '<span class="pagination-ellipsis">...</span>' :
            `<button class="btn ${page === state.currentPage ? 'btn-primary' : 'btn-outline'}" onclick="changePage(${page})">${page}</button>`
        ).join('')}
        <button class="btn btn-outline" onclick="changePage(${state.currentPage + 1})" ${state.currentPage === totalPages ? 'disabled' : ''}>Next</button>
    `;
}

function renderOrders(orders) {
    const container = document.getElementById('ordersContainer');
    
    if (!orders || orders.length === 0) {
        container.innerHTML = '<p class="no-orders">No orders yet</p>';
        return;
    }
    
    container.innerHTML = orders.map(order => `
        <div class="order-card">
            <div class="order-header">
                <span class="order-id">Order #${order._id.slice(-8)}</span>
                <span class="order-status status-${order.orderStatus}">${order.orderStatus}</span>
            </div>
            <div class="order-items">
                ${order.items.map(item => `
                    <div class="order-item">
                        <span>${item.productName}</span>
                        <span>Qty: ${item.quantity}</span>
                        <span>$${item.price.toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>
            <div class="order-footer">
                <span class="order-total">Total: $${order.totalAmount.toFixed(2)}</span>
                <span class="order-date">${new Date(order.createdAt).toLocaleDateString()}</span>
            </div>
        </div>
    `).join('');
}