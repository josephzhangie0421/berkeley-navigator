"""Read-only public Azure retail price lookup; no account credentials needed."""
import json
import httpx
query="serviceName eq 'Azure App Service' and armRegionName eq 'westus2' and skuName eq 'B1' and priceType eq 'Consumption'"
response=httpx.get('https://prices.azure.com/api/retail/prices',params={'$filter':query},timeout=30)
response.raise_for_status()
for item in response.json()['Items']:
    if 'Linux' in item['productName']:
        print(json.dumps({k:item.get(k) for k in ['productName','skuName','armRegionName','retailPrice','currencyCode','unitOfMeasure','effectiveStartDate']}))
        print('730-hour estimate:',round(item['retailPrice']*730,2),item['currencyCode'])
