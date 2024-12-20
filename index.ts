import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { uuid } from 'hap-nodejs'; // Typically available through hap-nodejs or homebridge API

// Adjust these imports based on the plugin’s existing structure.
// Ensure you have the correct references to hap-nodejs.
  
export class HDLBusproPlatform implements DynamicPlatformPlugin {
  private readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    // Listen for the event that signals Homebridge has finished loading all plugins
    this.api.on('didFinishLaunching', () => {
      this.log('didFinishLaunching: Creating accessories...');
      this.discoverDevices();
    });
  }

  // If the plugin caches accessories, they are restored here
  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  private discoverDevices() {
    const devices = this.getValidDevices();

    // For each valid device, create a new accessory
    devices.forEach((device) => {
      const accessoryUUID = this.api.hap.uuid.generate(`hdl-buspro-${device.device_address}-${device.channel}`);
      
      // Check if accessory already exists in cache
      let existingAccessory = this.accessories.find(acc => acc.UUID === accessoryUUID);
      if (!existingAccessory) {
        // Create new accessory
        const newAccessory = new this.api.platformAccessory(device.device_name, accessoryUUID);

        // Set required Accessory Information
        newAccessory.getService(this.api.hap.Service.AccessoryInformation)!
          .setCharacteristic(this.api.hap.Characteristic.Manufacturer, 'HDL')
          .setCharacteristic(this.api.hap.Characteristic.Model, device.device_type)
          .setCharacteristic(this.api.hap.Characteristic.SerialNumber, `${device.device_address}-${device.channel}`)
          .setCharacteristic(this.api.hap.Characteristic.FirmwareRevision, '1.0.0');

        // Add the appropriate service based on device type
        const service = this.createServiceForDevice(newAccessory, device);
        if (service) {
          this.log(`Adding accessory: ${device.device_name} (${device.device_type})`);
          this.api.registerPlatformAccessories('homebridge-hdl-buspro', 'HDLBusproHomebridge', [newAccessory]);
          this.accessories.push(newAccessory);
        } else {
          this.log(`No suitable HomeKit service found for device: ${device.device_name}. Skipping.`);
        }
      } else {
        this.log(`Accessory for ${device.device_name} already exists. Skipping creation.`);
      }
    });
  }

  private getValidDevices() {
    const supportedDeviceTypes = ['relaylightbulb', 'relaydimmablelightbulb', 'relaycurtains', 'drycontact'];
    const devices: any[] = []; // Adjust the type based on your actual config structure

    const buses = Array.isArray(this.config.buses) ? this.config.buses : [];
    for (const bus of buses) {
      if (!Array.isArray(bus.subnets)) continue;
      for (const subnet of bus.subnets) {
        if (!Array.isArray(subnet.devices)) continue;

        for (const device of subnet.devices) {
          const { device_name, device_address, device_type, area, channel, drycontact_type } = device;

          // Validate device type
          if (!supportedDeviceTypes.includes(device_type)) {
            this.log(`Unsupported device type: ${device_type} for device: ${device_name}`);
            continue;
          }

          // Create a clean device object without unsupported fields
          const cleanDevice: any = {
            device_name,
            device_address,
            device_type,
            area: area || 1,
            channel: channel || 1,
          };

          // For drycontact, validate subtype if provided
          if (device_type === 'drycontact' && drycontact_type) {
            // Make sure drycontact_type is recognized (e.g., 'smokesensor', 'occupancysensor')
            if (['smokesensor', 'occupancysensor'].includes(drycontact_type)) {
              cleanDevice.drycontact_type = drycontact_type;
            } else {
              this.log(`Unknown drycontact_type: ${drycontact_type} for device: ${device_name}. Defaulting to occupancy.`);
              cleanDevice.drycontact_type = 'occupancysensor';
            }
          }

          devices.push(cleanDevice);
        }
      }
    }

    return devices;
  }

  private createServiceForDevice(accessory: PlatformAccessory, device: any) {
    const { device_type, device_name, drycontact_type } = device;
    const { Service, Characteristic } = this.api.hap;

    let service: Service | undefined;

    switch (device_type) {
      case 'relaylightbulb':
        service = accessory.addService(Service.Lightbulb, device_name);
        // Implement required logic to handle ON/OFF states here
        break;

      case 'relaydimmablelightbulb':
        service = accessory.addService(Service.Lightbulb, device_name);
        service.getCharacteristic(Characteristic.Brightness);
        // Implement logic to handle brightness changes
        break;

      case 'relaycurtains':
        service = accessory.addService(Service.WindowCovering, device_name);
        // Implement logic for current position, target position, and position state
        break;

      case 'drycontact':
        if (drycontact_type === 'occupancysensor') {
          service = accessory.addService(Service.OccupancySensor, device_name);
          // Implement logic to update occupancy detection
        } else if (drycontact_type === 'smokesensor') {
          service = accessory.addService(Service.SmokeSensor, device_name);
          // Implement logic to update smoke detection state
        }
        break;
    }

    return service;
  }
}
