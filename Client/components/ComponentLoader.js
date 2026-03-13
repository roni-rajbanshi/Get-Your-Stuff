// client/components/ComponentLoader.js

class ComponentLoader {
    constructor(basePath = 'components/') {
        this.basePath = basePath;
        this.loadedComponents = new Map();
        this.loadingPromises = new Map();
    }

    /**
     * Load a single component by name
     * @param {string} componentName - Name of the component (without .html extension)
     * @param {string} targetId - ID of the element to load into
     * @returns {Promise<string>} - The loaded HTML content
     */
    async loadComponent(componentName, targetId) {
        const cacheKey = `${componentName}-${targetId}`;
        
        // Check if already loaded
        if (this.loadedComponents.has(cacheKey)) {
            return this.loadedComponents.get(cacheKey);
        }

        // Check if currently loading
        if (this.loadingPromises.has(cacheKey)) {
            return this.loadingPromises.get(cacheKey);
        }

        try {
            const url = `${this.basePath}${componentName}.html`;
            
            // Start loading
            const promise = fetch(url)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to load ${componentName}: ${response.status}`);
                    }
                    return response.text();
                })
                .then(html => {
                    // Store in cache
                    this.loadedComponents.set(cacheKey, html);
                    return html;
                });

            // Store loading promise
            this.loadingPromises.set(cacheKey, promise);

            const html = await promise;
            
            // Remove from loading promises
            this.loadingPromises.delete(cacheKey);

            // Insert into DOM
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.innerHTML = html;
            }

            return html;
        } catch (error) {
            console.error(`Error loading ${componentName}:`, error);
            throw error;
        }
    }

    /**
     * Load multiple components at once
     * @param {Array} components - Array of {name, targetId} objects
     * @returns {Promise<Object>} - Object with loaded components
     */
    async loadMultipleComponents(components) {
        const promises = components.map(component => 
            this.loadComponent(component.name, component.targetId)
                .then(html => ({ name: component.name, html }))
        );

        return Promise.all(promises);
    }

    /**
     * Load all components from a configuration
     * @param {Object} config - Component configuration
     */
    async loadAllComponents(config) {
        const components = Object.entries(config).map(([name, targetId]) => ({
            name,
            targetId
        }));

        return await this.loadMultipleComponents(components);
    }

    /**
     * Clear cached components
     * @param {string} componentName - Optional: specific component to clear
     */
    clearCache(componentName = null) {
        if (componentName) {
            const keys = Array.from(this.loadedComponents.keys())
                .filter(key => key.startsWith(componentName));
            keys.forEach(key => this.loadedComponents.delete(key));
        } else {
            this.loadedComponents.clear();
        }
    }

    /**
     * Check if a component is loaded
     * @param {string} componentName - Name of the component
     * @param {string} targetId - Target element ID
     * @returns {boolean}
     */
    isLoaded(componentName, targetId) {
        return this.loadedComponents.has(`${componentName}-${targetId}`);
    }

    /**
     * Get cached component
     * @param {string} componentName - Name of the component
     * @param {string} targetId - Target element ID
     * @returns {string|null}
     */
    getCachedComponent(componentName, targetId) {
        return this.loadedComponents.get(`${componentName}-${targetId}`) || null;
    }
}

// Export for use in app.js
window.ComponentLoader = ComponentLoader;