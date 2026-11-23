// Provision only after explicit approval. No credentials in this template.
param location string = 'westus2'
@allowed(['development', 'production'])
param environmentName string = 'development'
param apiName string
param staticName string
param planName string = '${apiName}-plan'
@allowed(['F1', 'B1'])
param sku string = 'B1'
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  kind: 'linux'
  sku: { name: sku, tier: sku == 'F1' ? 'Free' : 'Basic', capacity: 1 }
  properties: { reserved: true }
}
resource frontend 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticName
  location: location
  sku: { name: 'Free', tier: 'Free' }
  properties: { }
}
resource api 'Microsoft.Web/sites@2023-12-01' = {
  name: apiName
  location: location
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.14'
      appCommandLine: 'python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2 --no-access-log'
      alwaysOn: sku != 'F1'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      healthCheckPath: '/api/ready'
      appSettings: [
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }
        { name: 'APP_ENV', value: environmentName }
        { name: 'CORS_ORIGINS', value: 'https://${frontend.properties.defaultHostname}' }
        { name: 'GEMINI_MODEL', value: 'gemini-3.5-flash-lite' }
      ]
    }
  }
}
output apiUrl string = 'https://${api.properties.defaultHostName}'
output frontendUrl string = 'https://${frontend.properties.defaultHostname}'
